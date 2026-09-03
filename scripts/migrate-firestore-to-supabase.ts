/**
 * One-shot migration: legacy Firebase (Firestore) project -> new Supabase schema.
 *
 * Usage:
 *   npx tsx scripts/migrate-firestore-to-supabase.ts [--dry-run]
 *
 * Required environment variables:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  Path to a service-account JSON file, or the JSON itself inline.
 *   SUPABASE_URL                   Supabase project URL (https://<ref>.supabase.co).
 *   SUPABASE_SERVICE_ROLE_KEY      Supabase service role key (writes bypass RLS).
 *   MIGRATION_CHAIN_ID             Chain id stamped on migrated assets (falls back to
 *                                  NEXT_PUBLIC_THIRDWEB_CHAIN_ID). assets.chain_id is NOT NULL.
 *
 * firebase-admin is intentionally NOT an app dependency any more. Install it ad hoc:
 *   npm install firebase-admin --no-save
 *
 * See scripts/README-firestore-migration.md for the full mapping table.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json, TablesInsert } from "../src/types/database";

// ---------------------------------------------------------------------------
// Minimal structural types for the slice of firebase-admin we use. The module
// is loaded through an untyped dynamic import so the app can drop the package
// from its dependencies without breaking `tsc --noEmit`.
// ---------------------------------------------------------------------------

interface FirestoreCollectionRef {
  get(): Promise<FirestoreQuerySnapshot>;
}

interface FirestoreDocRef {
  collection(name: string): FirestoreCollectionRef;
}

interface FirestoreDocSnap {
  id: string;
  ref: FirestoreDocRef;
  data(): Record<string, unknown> | undefined;
}

interface FirestoreQuerySnapshot {
  docs: FirestoreDocSnap[];
}

interface FirestoreDb {
  collection(name: string): FirestoreCollectionRef;
}

interface FirebaseAdminNamespace {
  apps: unknown[];
  credential: { cert(serviceAccount: Record<string, unknown>): unknown };
  initializeApp(options: { credential: unknown; projectId?: string }): unknown;
  firestore(): FirestoreDb;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fail(message: string): never {
  console.error(`\n[migrate] FATAL: ${message}`);
  process.exit(1);
}

function requireEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    fail(`Missing required environment variable ${name}. ${hint}`);
  }
  return value.trim();
}

function lowerWallet(wallet: string): string {
  return wallet.trim().toLowerCase();
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function roundQty(value: number): number {
  return Math.round(value);
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date; _seconds?: unknown };
    if (typeof maybeTimestamp.toDate === "function") {
      try {
        const date = maybeTimestamp.toDate();
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      } catch {
        return null;
      }
    }
    if (typeof maybeTimestamp._seconds === "number") {
      return new Date(maybeTimestamp._seconds * 1000).toISOString();
    }
  }
  return null;
}

function sanitizeJson(value: unknown): Json {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Json;
  } catch {
    return null;
  }
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "category" : slug;
}

/** Deterministic, well formed UUID derived from a stable seed string. */
function deterministicUuid(seed: string): string {
  const hex = createHash("md5").update(`fractionaire-migration:${seed}`).digest("hex");
  const variantNibble = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variantNibble}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

interface CollectionStats {
  collection: string;
  docsRead: number;
  upserted: number;
  skipped: number;
  errors: number;
}

const STAT_ORDER = [
  "RetailUser",
  "RetailUser/*/Holding",
  "RetailUser/*/KYCIdentity",
  "BusinessUser",
  "BusinessUser/*/KYCIdentity",
  "AssetCategory",
  "AssetCategory/*/fields",
  "Asset",
  "Asset/*/Listing",
  "Asset/*/KYCRequirement",
  "Mint",
  "Transaction",
  "(stub users from referenced wallets)",
] as const;

const statsByCollection = new Map<string, CollectionStats>();
for (const name of STAT_ORDER) {
  statsByCollection.set(name, { collection: name, docsRead: 0, upserted: 0, skipped: 0, errors: 0 });
}

function stat(name: string): CollectionStats {
  const found = statsByCollection.get(name);
  if (!found) fail(`internal error: unknown stats bucket ${name}`);
  return found;
}

const errorMessages: string[] = [];
const warningMessages: string[] = [];

function recordError(collection: string, message: string): void {
  stat(collection).errors += 1;
  errorMessages.push(`[${collection}] ${message}`);
}

function warn(message: string): void {
  warningMessages.push(message);
}

// ---------------------------------------------------------------------------
// Chunked writer with per-row fallback so one bad row does not sink a chunk
// ---------------------------------------------------------------------------

interface WriteOutcome {
  written: number;
  failedRows: number;
  errorMessagesLocal: string[];
  returned: Record<string, unknown>[];
}

async function writeRows<Row>(
  rows: Row[],
  writeChunk: (chunk: Row[]) => Promise<{ data: unknown; error: { message: string } | null }>,
  describe: (row: Row) => string,
): Promise<WriteOutcome> {
  const outcome: WriteOutcome = { written: 0, failedRows: 0, errorMessagesLocal: [], returned: [] };
  for (const chunk of chunks(rows, 500)) {
    const result = await writeChunk(chunk);
    if (!result.error) {
      outcome.written += chunk.length;
      if (Array.isArray(result.data)) {
        outcome.returned.push(...(result.data as Record<string, unknown>[]));
      }
      continue;
    }
    if (chunk.length === 1) {
      outcome.failedRows += 1;
      outcome.errorMessagesLocal.push(`${describe(chunk[0])}: ${result.error.message}`);
      continue;
    }
    // Retry row by row to isolate the failing rows.
    for (const row of chunk) {
      const single = await writeChunk([row]);
      if (!single.error) {
        outcome.written += 1;
        if (Array.isArray(single.data)) {
          outcome.returned.push(...(single.data as Record<string, unknown>[]));
        }
      } else {
        outcome.failedRows += 1;
        outcome.errorMessagesLocal.push(`${describe(row)}: ${single.error.message}`);
      }
    }
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Firestore source shapes
// ---------------------------------------------------------------------------

interface SourceDoc {
  id: string;
  data: Record<string, unknown>;
}

interface SourceUser extends SourceDoc {
  holdings: SourceDoc[];
  kycIdentities: SourceDoc[];
}

interface SourceAsset extends SourceDoc {
  listings: SourceDoc[];
  kycRequirements: SourceDoc[];
}

interface SourceCategory extends SourceDoc {
  fields: SourceDoc[];
}

function snapToSourceDoc(snap: FirestoreDocSnap): SourceDoc {
  return { id: snap.id, data: snap.data() ?? {} };
}

async function readSubcollection(snap: FirestoreDocSnap, name: string): Promise<SourceDoc[]> {
  const sub = await snap.ref.collection(name).get();
  return sub.docs.map(snapToSourceDoc);
}

// ---------------------------------------------------------------------------
// firebase-admin dynamic loading
// ---------------------------------------------------------------------------

async function loadFirebaseAdmin(): Promise<FirebaseAdminNamespace> {
  // new Function keeps TypeScript from statically resolving the module, so the
  // script still typechecks after firebase-admin leaves package.json.
  const dynamicImport = new Function("specifier", "return import(specifier);") as unknown as (
    specifier: string,
  ) => Promise<Record<string, unknown>>;
  let mod: Record<string, unknown>;
  try {
    mod = await dynamicImport("firebase-admin");
  } catch {
    fail(
      "Could not load firebase-admin. It is intentionally not an app dependency any more. " +
        "Install it for this one run with: npm install firebase-admin --no-save",
    );
  }
  const candidate = ((mod as { default?: unknown }).default ?? mod) as Partial<FirebaseAdminNamespace>;
  if (
    typeof candidate.firestore !== "function" ||
    typeof candidate.initializeApp !== "function" ||
    candidate.credential === undefined
  ) {
    fail("Loaded firebase-admin but it does not expose the expected admin namespace API.");
  }
  return candidate as FirebaseAdminNamespace;
}

function loadServiceAccount(raw: string): Record<string, unknown> {
  let text = raw;
  if (!raw.startsWith("{")) {
    try {
      text = readFileSync(raw, "utf8");
    } catch (err) {
      fail(`FIREBASE_SERVICE_ACCOUNT_JSON looks like a path but the file could not be read: ${String(err)}`);
    }
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("FIREBASE_SERVICE_ACCOUNT_JSON did not parse to a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    fail(`FIREBASE_SERVICE_ACCOUNT_JSON is neither valid inline JSON nor a readable JSON file: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type SupabaseDb = ReturnType<typeof createClient<Database>>;

interface IdMap {
  dryRun: boolean;
  generatedAt: string;
  users: Record<string, string>;
  categories: Record<string, string>;
  assets: Record<string, string>;
  listings: Record<string, string>;
  holdings: Record<string, string>;
  kycIdentities: Record<string, string>;
  transactions: Record<string, string>;
}

interface MergedUserSource {
  wallet: string;
  retail?: SourceUser;
  business?: SourceUser;
  stub: boolean;
  stubType: "retail" | "business";
}

const previewRows: Record<string, unknown[]> = {};

function preview(table: string, row: unknown): void {
  const bucket = (previewRows[table] ??= []);
  if (bucket.length < 2) bucket.push(row);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const serviceAccountRaw = requireEnv(
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "Set it to the path of the OLD Firebase project service-account JSON file, or paste the JSON inline.",
  );
  const supabaseUrl = requireEnv("SUPABASE_URL", "Set it to the Supabase project URL, e.g. https://xyz.supabase.co");
  const serviceRoleKey = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "Set it to the Supabase service role key (Settings > API). The anon key cannot write through RLS.",
  );
  const chainIdRaw = process.env.MIGRATION_CHAIN_ID ?? process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID;
  if (!chainIdRaw || chainIdRaw.trim() === "") {
    fail(
      "Missing MIGRATION_CHAIN_ID (or NEXT_PUBLIC_THIRDWEB_CHAIN_ID). assets.chain_id is NOT NULL, " +
        "so the script needs the chain id the legacy NFTs live on.",
    );
  }
  const chainId = Number.parseInt(chainIdRaw, 10);
  if (!Number.isFinite(chainId)) {
    fail(`MIGRATION_CHAIN_ID must be an integer, got "${chainIdRaw}".`);
  }

  const outputDir = join(process.cwd(), "migration-output");
  mkdirSync(outputDir, { recursive: true });

  const serviceAccount = loadServiceAccount(serviceAccountRaw);
  const admin = await loadFirebaseAdmin();
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: asString(serviceAccount["project_id"]) ?? undefined,
    });
  }
  const firestore = admin.firestore();

  const supabase: SupabaseDb = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`[migrate] mode: ${dryRun ? "DRY RUN (no Supabase writes)" : "LIVE"}`);
  console.log(`[migrate] chain id for assets: ${chainId}`);

  const idMap: IdMap = {
    dryRun,
    generatedAt: new Date().toISOString(),
    users: {},
    categories: {},
    assets: {},
    listings: {},
    holdings: {},
    kycIdentities: {},
    transactions: {},
  };

  // -------------------------------------------------------------------------
  // 1. Read everything from Firestore
  // -------------------------------------------------------------------------

  console.log("[migrate] reading Firestore ...");

  const retailSnaps = (await firestore.collection("RetailUser").get()).docs;
  const retailUsers: SourceUser[] = await Promise.all(
    retailSnaps.map(async (snap) => ({
      ...snapToSourceDoc(snap),
      holdings: await readSubcollection(snap, "Holding"),
      kycIdentities: await readSubcollection(snap, "KYCIdentity"),
    })),
  );

  const businessSnaps = (await firestore.collection("BusinessUser").get()).docs;
  const businessUsers: SourceUser[] = await Promise.all(
    businessSnaps.map(async (snap) => ({
      ...snapToSourceDoc(snap),
      holdings: [],
      kycIdentities: await readSubcollection(snap, "KYCIdentity"),
    })),
  );

  const assetSnaps = (await firestore.collection("Asset").get()).docs;
  const assets: SourceAsset[] = await Promise.all(
    assetSnaps.map(async (snap) => ({
      ...snapToSourceDoc(snap),
      listings: await readSubcollection(snap, "Listing"),
      kycRequirements: await readSubcollection(snap, "KYCRequirement"),
    })),
  );

  const categorySnaps = (await firestore.collection("AssetCategory").get()).docs;
  const categories: SourceCategory[] = await Promise.all(
    categorySnaps.map(async (snap) => ({
      ...snapToSourceDoc(snap),
      fields: await readSubcollection(snap, "fields"),
    })),
  );

  const mints: SourceDoc[] = (await firestore.collection("Mint").get()).docs.map(snapToSourceDoc);
  const transactions: SourceDoc[] = (await firestore.collection("Transaction").get()).docs.map(snapToSourceDoc);

  stat("RetailUser").docsRead = retailUsers.length;
  stat("RetailUser/*/Holding").docsRead = retailUsers.reduce((n, u) => n + u.holdings.length, 0);
  stat("RetailUser/*/KYCIdentity").docsRead = retailUsers.reduce((n, u) => n + u.kycIdentities.length, 0);
  stat("BusinessUser").docsRead = businessUsers.length;
  stat("BusinessUser/*/KYCIdentity").docsRead = businessUsers.reduce((n, u) => n + u.kycIdentities.length, 0);
  stat("Asset").docsRead = assets.length;
  stat("Asset/*/Listing").docsRead = assets.reduce((n, a) => n + a.listings.length, 0);
  stat("Asset/*/KYCRequirement").docsRead = assets.reduce((n, a) => n + a.kycRequirements.length, 0);
  stat("AssetCategory").docsRead = categories.length;
  stat("AssetCategory/*/fields").docsRead = categories.reduce((n, c) => n + c.fields.length, 0);
  stat("Mint").docsRead = mints.length;
  stat("Transaction").docsRead = transactions.length;

  console.log(
    `[migrate] read ${retailUsers.length} RetailUser, ${businessUsers.length} BusinessUser, ` +
      `${assets.length} Asset, ${categories.length} AssetCategory, ${mints.length} Mint, ` +
      `${transactions.length} Transaction`,
  );

  // -------------------------------------------------------------------------
  // 2. Asset categories: match seeded rows by name, update only when different
  // -------------------------------------------------------------------------

  const existingCategoriesRes = await supabase
    .from("asset_categories")
    .select("id,name,slug,fields,is_active");
  if (existingCategoriesRes.error) {
    fail(`Could not read asset_categories from Supabase: ${existingCategoriesRes.error.message}`);
  }
  const existingCategories = existingCategoriesRes.data ?? [];
  const existingByNameLower = new Map<string, (typeof existingCategories)[number]>();
  const existingBySlug = new Map<string, (typeof existingCategories)[number]>();
  for (const row of existingCategories) {
    existingByNameLower.set(row.name.toLowerCase(), row);
    existingBySlug.set(row.slug, row);
  }

  const categoryIdByFirestoreId = new Map<string, string>();
  const categoryIdByNameLower = new Map<string, string>();
  for (const row of existingCategories) {
    categoryIdByNameLower.set(row.name.toLowerCase(), row.id);
  }

  const normalizeFieldsForCompare = (fields: unknown): string => {
    const list = Array.isArray(fields) ? [...(fields as unknown[])] : [];
    list.sort((a, b) => {
      const nameA = asString((a as Record<string, unknown> | null)?.["name"]) ?? "";
      const nameB = asString((b as Record<string, unknown> | null)?.["name"]) ?? "";
      return nameA.localeCompare(nameB);
    });
    return JSON.stringify(list);
  };

  const categoryInserts: TablesInsert<"asset_categories">[] = [];
  interface CategoryUpdate {
    id: string;
    name: string;
    patch: { is_active?: boolean; fields?: Json };
  }
  const categoryUpdates: CategoryUpdate[] = [];

  for (const category of categories) {
    const name = asString(category.data["name"]);
    if (!name) {
      recordError("AssetCategory", `doc ${category.id} has no name field, cannot map`);
      continue;
    }
    const isActive = category.data["isEnabled"] !== false;
    const firestoreFields = category.fields.map((f) => sanitizeJson(f.data));
    // The legacy `image` field (a Firebase Storage URL) has no column in the new
    // schema and is dropped on purpose.

    const existing = existingByNameLower.get(name.toLowerCase());
    if (existing) {
      categoryIdByFirestoreId.set(category.id, existing.id);
      categoryIdByNameLower.set(name.toLowerCase(), existing.id);
      const patch: CategoryUpdate["patch"] = {};
      if (existing.is_active !== isActive) patch.is_active = isActive;
      if (
        category.fields.length > 0 &&
        normalizeFieldsForCompare(firestoreFields) !== normalizeFieldsForCompare(existing.fields)
      ) {
        patch.fields = firestoreFields as Json;
      }
      if (Object.keys(patch).length > 0) {
        categoryUpdates.push({ id: existing.id, name, patch });
      } else {
        stat("AssetCategory").skipped += 1;
      }
      continue;
    }

    const slug = slugify(name);
    const insert: TablesInsert<"asset_categories"> = {
      name,
      slug,
      is_active: isActive,
      fields: firestoreFields as Json,
    };
    categoryInserts.push(insert);
    preview("asset_categories", insert);
    // Placeholder until the live upsert returns the real id.
    const placeholder = deterministicUuid(`category:${slug}`);
    categoryIdByFirestoreId.set(category.id, placeholder);
    categoryIdByNameLower.set(name.toLowerCase(), placeholder);
  }
  stat("AssetCategory/*/fields").skipped = stat("AssetCategory/*/fields").docsRead; // folded into asset_categories.fields

  if (!dryRun) {
    for (const update of categoryUpdates) {
      const res = await supabase.from("asset_categories").update(update.patch).eq("id", update.id);
      if (res.error) {
        recordError("AssetCategory", `update of category "${update.name}": ${res.error.message}`);
      } else {
        stat("AssetCategory").upserted += 1;
      }
    }
    if (categoryInserts.length > 0) {
      const outcome = await writeRows(
        categoryInserts,
        async (chunk) => {
          const { data, error } = await supabase
            .from("asset_categories")
            .upsert(chunk, { onConflict: "slug" })
            .select("id,name,slug");
          return { data, error };
        },
        (row) => `category ${row.name}`,
      );
      stat("AssetCategory").upserted += outcome.written;
      stat("AssetCategory").errors += outcome.failedRows;
      errorMessages.push(...outcome.errorMessagesLocal.map((m) => `[AssetCategory] ${m}`));
      for (const returned of outcome.returned) {
        const name = asString(returned["name"]);
        const id = asString(returned["id"]);
        if (name && id) categoryIdByNameLower.set(name.toLowerCase(), id);
      }
      // Re-point firestore ids at the real uuids.
      for (const category of categories) {
        const name = asString(category.data["name"]);
        if (!name) continue;
        const realId = categoryIdByNameLower.get(name.toLowerCase());
        if (realId) categoryIdByFirestoreId.set(category.id, realId);
      }
    }
  } else {
    stat("AssetCategory").upserted += categoryUpdates.length + categoryInserts.length;
    for (const update of categoryUpdates) preview("asset_categories (updates)", update);
  }

  let otherCategoryId: string | null = existingBySlug.get("other")?.id ?? null;
  const ensureOtherCategory = async (): Promise<string> => {
    if (otherCategoryId) return otherCategoryId;
    if (dryRun) {
      otherCategoryId = deterministicUuid("category:other");
      return otherCategoryId;
    }
    const res = await supabase
      .from("asset_categories")
      .upsert({ name: "Other", slug: "other", fields: [] as Json, is_active: true }, { onConflict: "slug" })
      .select("id")
      .single();
    if (res.error || !res.data) {
      fail(`Could not create fallback "Other" asset category: ${res.error?.message ?? "no row returned"}`);
    }
    otherCategoryId = res.data.id;
    return otherCategoryId;
  };

  // -------------------------------------------------------------------------
  // 3. Users (RetailUser + BusinessUser merged on wallet, plus stubs for
  //    wallets referenced by listings/holdings/transactions/mints)
  // -------------------------------------------------------------------------

  const merged = new Map<string, MergedUserSource>();

  for (const user of retailUsers) {
    const wallet = lowerWallet(user.id);
    const entry = merged.get(wallet) ?? { wallet, stub: false, stubType: "retail" as const };
    entry.retail = user;
    entry.stub = false;
    merged.set(wallet, entry);
  }
  for (const user of businessUsers) {
    const wallet = lowerWallet(user.id);
    const entry = merged.get(wallet) ?? { wallet, stub: false, stubType: "business" as const };
    if (entry.retail) {
      warn(
        `wallet ${wallet} exists in both RetailUser and BusinessUser; merged into one users row with type=business ` +
          "(business fields win, retail-only fields kept)",
      );
    }
    entry.business = user;
    entry.stub = false;
    merged.set(wallet, entry);
  }

  const minterWallets = new Set<string>();
  for (const asset of assets) {
    const minter = asString(asset.data["minterId"]);
    if (minter) minterWallets.add(lowerWallet(minter));
  }

  const referencedWallets = new Set<string>(minterWallets);
  for (const asset of assets) {
    for (const listing of asset.listings) {
      const lister = asString(listing.data["listerId"]);
      if (lister) referencedWallets.add(lowerWallet(lister));
    }
  }
  for (const tx of transactions) {
    for (const key of ["fromWallet", "toWallet"] as const) {
      const wallet = asString(tx.data[key]);
      if (wallet) referencedWallets.add(lowerWallet(wallet));
    }
  }
  for (const mint of mints) {
    const minter = asString(mint.data["minterId"]);
    if (minter) referencedWallets.add(lowerWallet(minter));
  }
  for (const wallet of referencedWallets) {
    if (!merged.has(wallet)) {
      merged.set(wallet, {
        wallet,
        stub: true,
        stubType: minterWallets.has(wallet) ? "business" : "retail",
      });
      stat("(stub users from referenced wallets)").docsRead += 1;
    }
  }

  const businessWallets = new Set<string>(minterWallets);
  for (const user of businessUsers) businessWallets.add(lowerWallet(user.id));

  const userRows: TablesInsert<"users">[] = [];
  for (const entry of merged.values()) {
    if (entry.stub) {
      userRows.push({
        wallet_address: entry.wallet,
        type: entry.stubType,
        is_verified: false,
        settings: {} as Json,
      });
      continue;
    }
    const isBusiness = entry.business !== undefined;
    const primary = isBusiness ? entry.business?.data ?? {} : entry.retail?.data ?? {};
    const secondary = isBusiness ? entry.retail?.data ?? {} : {};
    const retailKycVerified =
      entry.retail !== undefined &&
      (entry.retail.data["isVerified"] === true ||
        entry.retail.kycIdentities.some((doc) => doc.data["sumsubVerified"] === true));
    const createdCandidates = [toIso(entry.retail?.data["createdAt"]), toIso(entry.business?.data["createdAt"])]
      .filter((v): v is string => v !== null)
      .sort();
    userRows.push({
      wallet_address: entry.wallet,
      type: isBusiness ? "business" : "retail",
      name: asString(entry.retail?.data["fullName"]) ?? asString(entry.retail?.data["name"]),
      display_name: asString(entry.business?.data["displayName"]),
      legal_name: asString(entry.business?.data["legalName"]),
      email: asString(primary["email"]) ?? asString(secondary["email"]),
      phone: asString(primary["phone"]) ?? asString(secondary["phone"]),
      logo_url: asString(entry.business?.data["logo"]),
      is_verified: isBusiness ? entry.business?.data["isVerified"] === true : retailKycVerified,
      settings: sanitizeJson(primary["settings"] ?? secondary["settings"] ?? {}) ?? ({} as Json),
      created_at: createdCandidates[0],
    });
  }
  for (const row of userRows) preview("users", row);

  const userIdByWallet = new Map<string, string>();
  if (dryRun) {
    for (const row of userRows) {
      userIdByWallet.set(row.wallet_address, deterministicUuid(`user:${row.wallet_address}`));
    }
  } else {
    const outcome = await writeRows(
      userRows,
      async (chunk) => {
        const { data, error } = await supabase
          .from("users")
          .upsert(chunk, { onConflict: "wallet_address" })
          .select("id,wallet_address");
        return { data, error };
      },
      (row) => `user ${row.wallet_address}`,
    );
    for (const returned of outcome.returned) {
      const wallet = asString(returned["wallet_address"]);
      const id = asString(returned["id"]);
      if (wallet && id) userIdByWallet.set(wallet, id);
    }
    // Attribute counts back to the source collections.
    for (const row of userRows) {
      const entry = merged.get(row.wallet_address);
      const bucket = entry?.stub
        ? "(stub users from referenced wallets)"
        : entry?.business
          ? "BusinessUser"
          : "RetailUser";
      if (userIdByWallet.has(row.wallet_address)) {
        stat(bucket).upserted += 1;
      } else {
        stat(bucket).errors += 1;
      }
    }
    errorMessages.push(...outcome.errorMessagesLocal.map((m) => `[users] ${m}`));
  }
  if (dryRun) {
    for (const row of userRows) {
      const entry = merged.get(row.wallet_address);
      const bucket = entry?.stub
        ? "(stub users from referenced wallets)"
        : entry?.business
          ? "BusinessUser"
          : "RetailUser";
      stat(bucket).upserted += 1;
    }
  }
  for (const [wallet, id] of userIdByWallet) {
    idMap.users[wallet] = id;
  }

  const resolveUser = (wallet: string | null): string | null => {
    if (!wallet) return null;
    return userIdByWallet.get(lowerWallet(wallet)) ?? null;
  };

  // business_profiles for every business-typed user
  const businessProfileRows: TablesInsert<"business_profiles">[] = [];
  for (const entry of merged.values()) {
    const isBusiness = entry.business !== undefined || (entry.stub && entry.stubType === "business");
    if (!isBusiness) continue;
    const userId = userIdByWallet.get(entry.wallet);
    if (!userId) continue;
    businessProfileRows.push({
      user_id: userId,
      display_name: asString(entry.business?.data["displayName"]),
      logo_url: asString(entry.business?.data["logo"]),
    });
  }
  for (const row of businessProfileRows) preview("business_profiles", row);
  if (!dryRun && businessProfileRows.length > 0) {
    const outcome = await writeRows(
      businessProfileRows,
      async (chunk) => {
        const { data, error } = await supabase
          .from("business_profiles")
          .upsert(chunk, { onConflict: "user_id" })
          .select("user_id");
        return { data, error };
      },
      (row) => `business_profile ${row.user_id}`,
    );
    if (outcome.failedRows > 0) {
      errorMessages.push(...outcome.errorMessagesLocal.map((m) => `[business_profiles] ${m}`));
      stat("BusinessUser").errors += outcome.failedRows;
    }
  }

  // -------------------------------------------------------------------------
  // 4. Assets
  // -------------------------------------------------------------------------

  const mintPriceByAssetId = new Map<number, number>();
  for (const mint of mints) {
    const assetId = asNumber(mint.data["assetId"]);
    const price = asNumber(mint.data["mintPrice"]);
    if (assetId !== null && price !== null && !mintPriceByAssetId.has(assetId)) {
      mintPriceByAssetId.set(assetId, price);
    }
  }

  interface AssetRowWithSource {
    row: TablesInsert<"assets">;
    firestoreId: string;
    nftId: number;
  }
  const assetRowsWithSource: AssetRowWithSource[] = [];

  for (const asset of assets) {
    const nftId = Number.parseInt(asset.id, 10);
    if (!Number.isFinite(nftId) || String(nftId) !== asset.id.trim()) {
      recordError("Asset", `doc id "${asset.id}" is not a numeric NFT id; cannot upsert on nft_id, skipped`);
      continue;
    }
    const minterWallet = asString(asset.data["minterId"]);
    const businessId = resolveUser(minterWallet);
    if (!businessId) {
      recordError("Asset", `doc ${asset.id}: minterId "${String(minterWallet)}" did not resolve to a user`);
      continue;
    }
    const legacyCategory = asString(asset.data["assetCategory"]);
    let categoryId =
      (legacyCategory ? categoryIdByFirestoreId.get(legacyCategory) : undefined) ??
      (legacyCategory ? categoryIdByNameLower.get(legacyCategory.toLowerCase()) : undefined) ??
      null;
    if (!categoryId) {
      categoryId = await ensureOtherCategory();
      warn(`Asset ${asset.id}: category "${String(legacyCategory)}" unresolved, assigned fallback category Other`);
    }
    const availableSupply = asNumber(asset.data["availableSupply"]);
    const initialSupply = asNumber(asset.data["initialSupply"]);
    const kycRequired = asset.kycRequirements.some((doc) => doc.data["sumsubVerified"] === true);
    const floorPrice = asNumber(asset.data["pricePerFraction"]);
    const row: TablesInsert<"assets"> = {
      nft_id: nftId,
      internal_id: asString(asset.data["internalId"]),
      business_id: businessId,
      category_id: categoryId,
      // Firestore assets only exist after a successful mint, so the NFT exists:
      // active unless fully sold out.
      status: availableSupply === 0 ? "sold_out" : "active",
      name: asString(asset.data["assetName"]) ?? `Asset #${asset.id}`,
      metadata: sanitizeJson({ firestoreDocId: asset.id, legacy: asset.data }) ?? ({} as Json),
      total_supply: initialSupply !== null && initialSupply > 0 ? roundQty(initialSupply) : null,
      available_supply: availableSupply !== null && availableSupply >= 0 ? roundQty(availableSupply) : null,
      mint_price_per_fraction: mintPriceByAssetId.get(nftId) ?? null,
      floor_price_per_fraction: floorPrice !== null && floorPrice > 0 ? floorPrice : null,
      kyc_required: kycRequired,
      mint_tx_hash: asString(asset.data["txHash"]),
      chain_id: chainId,
      created_at: toIso(asset.data["createdAt"]) ?? undefined,
    };
    assetRowsWithSource.push({ row, firestoreId: asset.id, nftId });
    preview("assets", row);
  }
  stat("Asset/*/KYCRequirement").skipped = stat("Asset/*/KYCRequirement").docsRead; // folded into assets.kyc_required

  const assetIdByNftId = new Map<number, string>();
  if (dryRun) {
    for (const { nftId } of assetRowsWithSource) {
      assetIdByNftId.set(nftId, deterministicUuid(`asset:${nftId}`));
    }
    stat("Asset").upserted += assetRowsWithSource.length;
  } else {
    const outcome = await writeRows(
      assetRowsWithSource.map((a) => a.row),
      async (chunk) => {
        const { data, error } = await supabase.from("assets").upsert(chunk, { onConflict: "nft_id" }).select("id,nft_id");
        return { data, error };
      },
      (row) => `asset nft_id=${String(row.nft_id)}`,
    );
    stat("Asset").upserted += outcome.written;
    stat("Asset").errors += outcome.failedRows;
    errorMessages.push(...outcome.errorMessagesLocal.map((m) => `[Asset] ${m}`));
    for (const returned of outcome.returned) {
      const nftId = asNumber(returned["nft_id"]);
      const id = asString(returned["id"]);
      if (nftId !== null && id) assetIdByNftId.set(nftId, id);
    }
  }
  for (const { firestoreId, nftId } of assetRowsWithSource) {
    const id = assetIdByNftId.get(nftId);
    if (id) idMap.assets[`Asset/${firestoreId}`] = id;
  }
  for (const category of categories) {
    const id = categoryIdByFirestoreId.get(category.id);
    if (id) idMap.categories[`AssetCategory/${category.id}`] = id;
  }

  // -------------------------------------------------------------------------
  // 5. Listings
  // -------------------------------------------------------------------------

  interface ListingRowWithSource {
    row: TablesInsert<"listings">;
    paths: string[];
  }
  const listingRows = new Map<string, ListingRowWithSource>(); // keyed by row id

  for (const asset of assets) {
    const nftId = Number.parseInt(asset.id, 10);
    const assetUuid = Number.isFinite(nftId) ? assetIdByNftId.get(nftId) : undefined;
    for (const listing of asset.listings) {
      const path = `Asset/${asset.id}/Listing/${listing.id}`;
      if (!assetUuid) {
        recordError("Asset/*/Listing", `${path}: parent asset was not migrated`);
        continue;
      }
      const listerWallet = asString(listing.data["listerId"]);
      const listerId = resolveUser(listerWallet);
      if (!listerId) {
        recordError("Asset/*/Listing", `${path}: listerId "${String(listerWallet)}" did not resolve to a user`);
        continue;
      }
      const price = asNumber(listing.data["pricePerFraction"]);
      if (price === null || price <= 0) {
        recordError("Asset/*/Listing", `${path}: pricePerFraction ${String(listing.data["pricePerFraction"])} is not > 0`);
        continue;
      }
      const quantity = roundQty(asNumber(listing.data["quantity"]) ?? 0);
      const status: "active" | "filled" = quantity > 0 ? "active" : "filled";
      const kind: "primary" | "secondary" = businessWallets.has(lowerWallet(listerWallet ?? "")) ? "primary" : "secondary";
      const rowId = deterministicUuid(`listing:${asset.id}:${listing.id}`);

      // The schema enforces one active listing per (asset, lister, price).
      // Legacy duplicates are merged into a single row.
      if (status === "active") {
        const dupKey = `${assetUuid}|${listerId}|${price}`;
        const existing = [...listingRows.values()].find(
          (l) =>
            l.row.status === "active" &&
            l.row.asset_id === assetUuid &&
            l.row.lister_id === listerId &&
            l.row.price_per_fraction === price,
        );
        if (existing) {
          existing.row.quantity = (existing.row.quantity ?? 0) + quantity;
          existing.row.original_quantity = (existing.row.original_quantity ?? 0) + quantity;
          existing.paths.push(path);
          warn(`${path}: merged into duplicate active listing (${dupKey})`);
          stat("Asset/*/Listing").skipped += 1;
          continue;
        }
      }

      listingRows.set(rowId, {
        paths: [path],
        row: {
          id: rowId,
          asset_id: assetUuid,
          lister_id: listerId,
          kind,
          quantity,
          original_quantity: quantity > 0 ? quantity : 1,
          price_per_fraction: price,
          currency: asString(listing.data["currency"]) ?? "USDC",
          status,
          created_at: toIso(listing.data["createdAt"]) ?? undefined,
        },
      });
    }
  }
  for (const { row } of listingRows.values()) preview("listings", row);

  if (dryRun) {
    stat("Asset/*/Listing").upserted += listingRows.size;
  } else {
    const outcome = await writeRows(
      [...listingRows.values()].map((l) => l.row),
      async (chunk) => {
        const { data, error } = await supabase.from("listings").upsert(chunk, { onConflict: "id" }).select("id");
        return { data, error };
      },
      (row) => `listing ${String(row.id)}`,
    );
    stat("Asset/*/Listing").upserted += outcome.written;
    stat("Asset/*/Listing").errors += outcome.failedRows;
    errorMessages.push(...outcome.errorMessagesLocal.map((m) => `[Asset/*/Listing] ${m}`));
  }
  for (const [rowId, { paths }] of listingRows) {
    for (const path of paths) idMap.listings[path] = rowId;
  }

  // -------------------------------------------------------------------------
  // 6. Holdings (merged on user + asset, the schema's natural key)
  // -------------------------------------------------------------------------

  interface HoldingAccumulator {
    userId: string;
    assetId: string;
    quantity: number;
    locked: number;
    weightedPriceNumerator: number;
    weightedPriceQuantity: number;
    createdAt: string | null;
    paths: string[];
  }
  const holdingAcc = new Map<string, HoldingAccumulator>();

  for (const user of retailUsers) {
    const wallet = lowerWallet(user.id);
    const userId = userIdByWallet.get(wallet);
    for (const holding of user.holdings) {
      const path = `RetailUser/${user.id}/Holding/${holding.id}`;
      if (!userId) {
        recordError("RetailUser/*/Holding", `${path}: owner wallet did not resolve to a user`);
        continue;
      }
      const assetNftId = asNumber(holding.data["assetId"]);
      const assetUuid = assetNftId !== null ? assetIdByNftId.get(assetNftId) : undefined;
      if (!assetUuid) {
        recordError(
          "RetailUser/*/Holding",
          `${path}: assetId ${String(holding.data["assetId"])} did not resolve to a migrated asset`,
        );
        continue;
      }
      const quantity = roundQty(asNumber(holding.data["quantity"]) ?? 0);
      const locked = roundQty(asNumber(holding.data["lockedQuantity"]) ?? 0);
      const avgPrice = asNumber(holding.data["averageEntryPrice"]);
      const createdAt = toIso(holding.data["createdAt"]);
      const key = `${userId}|${assetUuid}`;
      const acc = holdingAcc.get(key);
      if (acc) {
        acc.quantity += quantity;
        acc.locked += locked;
        if (avgPrice !== null && quantity > 0) {
          acc.weightedPriceNumerator += avgPrice * quantity;
          acc.weightedPriceQuantity += quantity;
        }
        if (createdAt && (!acc.createdAt || createdAt < acc.createdAt)) acc.createdAt = createdAt;
        acc.paths.push(path);
        warn(`${path}: merged into existing holding for the same user and asset`);
        stat("RetailUser/*/Holding").skipped += 1;
      } else {
        holdingAcc.set(key, {
          userId,
          assetId: assetUuid,
          quantity,
          locked,
          weightedPriceNumerator: avgPrice !== null && quantity > 0 ? avgPrice * quantity : 0,
          weightedPriceQuantity: avgPrice !== null && quantity > 0 ? quantity : 0,
          createdAt,
          paths: [path],
        });
      }
    }
  }

  interface HoldingRowWithSource {
    row: TablesInsert<"holdings">;
    paths: string[];
    key: string;
  }
  const holdingRowsWithSource: HoldingRowWithSource[] = [];
  for (const [key, acc] of holdingAcc) {
    let locked = acc.locked;
    if (locked > acc.quantity) {
      warn(
        `holding ${acc.paths[0]}: lockedQuantity ${locked} exceeds quantity ${acc.quantity}, ` +
          "clamped to quantity to satisfy holdings_locked_lte_quantity",
      );
      locked = acc.quantity;
    }
    const row: TablesInsert<"holdings"> = {
      user_id: acc.userId,
      asset_id: acc.assetId,
      quantity: Math.max(acc.quantity, 0),
      locked_quantity: Math.max(locked, 0),
      average_entry_price:
        acc.weightedPriceQuantity > 0 ? acc.weightedPriceNumerator / acc.weightedPriceQuantity : null,
      created_at: acc.createdAt ?? undefined,
    };
    holdingRowsWithSource.push({ row, paths: acc.paths, key });
    preview("holdings", row);
  }

  const holdingIdByKey = new Map<string, string>();
  if (dryRun) {
    for (const { key } of holdingRowsWithSource) {
      holdingIdByKey.set(key, deterministicUuid(`holding:${key}`));
    }
    stat("RetailUser/*/Holding").upserted += holdingRowsWithSource.length;
  } else {
    const outcome = await writeRows(
      holdingRowsWithSource.map((h) => h.row),
      async (chunk) => {
        const { data, error } = await supabase
          .from("holdings")
          .upsert(chunk, { onConflict: "user_id,asset_id" })
          .select("id,user_id,asset_id");
        return { data, error };
      },
      (row) => `holding user=${String(row.user_id)} asset=${String(row.asset_id)}`,
    );
    stat("RetailUser/*/Holding").upserted += outcome.written;
    stat("RetailUser/*/Holding").errors += outcome.failedRows;
    errorMessages.push(...outcome.errorMessagesLocal.map((m) => `[RetailUser/*/Holding] ${m}`));
    for (const returned of outcome.returned) {
      const userId = asString(returned["user_id"]);
      const assetId = asString(returned["asset_id"]);
      const id = asString(returned["id"]);
      if (userId && assetId && id) holdingIdByKey.set(`${userId}|${assetId}`, id);
    }
  }
  for (const { key, paths } of holdingRowsWithSource) {
    const id = holdingIdByKey.get(key);
    if (!id) continue;
    for (const path of paths) idMap.holdings[path] = id;
  }

  // -------------------------------------------------------------------------
  // 7. KYC identities
  // -------------------------------------------------------------------------

  interface KycRowWithSource {
    row: TablesInsert<"kyc_identities">;
    path: string;
    bucket: "RetailUser/*/KYCIdentity" | "BusinessUser/*/KYCIdentity";
  }
  const kycRows: KycRowWithSource[] = [];
  const collectKyc = (
    users: SourceUser[],
    collection: "RetailUser" | "BusinessUser",
    bucket: KycRowWithSource["bucket"],
  ): void => {
    for (const user of users) {
      const wallet = lowerWallet(user.id);
      const userId = userIdByWallet.get(wallet);
      for (const doc of user.kycIdentities) {
        const path = `${collection}/${user.id}/KYCIdentity/${doc.id}`;
        if (!userId) {
          recordError(bucket, `${path}: owner wallet did not resolve to a user`);
          continue;
        }
        const rowId = deterministicUuid(`kyc:${collection}:${wallet}:${doc.id}`);
        kycRows.push({
          bucket,
          path,
          row: {
            id: rowId,
            user_id: userId,
            provider: "sumsub",
            status: doc.data["sumsubVerified"] === true ? "approved" : "pending",
            raw_payload: sanitizeJson({ firestorePath: path, legacy: doc.data }),
          },
        });
      }
    }
  };
  collectKyc(retailUsers, "RetailUser", "RetailUser/*/KYCIdentity");
  collectKyc(businessUsers, "BusinessUser", "BusinessUser/*/KYCIdentity");
  for (const { row } of kycRows) preview("kyc_identities", row);

  if (dryRun) {
    for (const { bucket } of kycRows) stat(bucket).upserted += 1;
  } else if (kycRows.length > 0) {
    for (const bucket of ["RetailUser/*/KYCIdentity", "BusinessUser/*/KYCIdentity"] as const) {
      const rows = kycRows.filter((k) => k.bucket === bucket);
      if (rows.length === 0) continue;
      const outcome = await writeRows(
        rows.map((k) => k.row),
        async (chunk) => {
          const { data, error } = await supabase.from("kyc_identities").upsert(chunk, { onConflict: "id" }).select("id");
          return { data, error };
        },
        (row) => `kyc_identity ${String(row.id)}`,
      );
      stat(bucket).upserted += outcome.written;
      stat(bucket).errors += outcome.failedRows;
      errorMessages.push(...outcome.errorMessagesLocal.map((m) => `[${bucket}] ${m}`));
    }
  }
  for (const { row, path } of kycRows) {
    if (row.id) idMap.kycIdentities[path] = row.id;
  }

  // -------------------------------------------------------------------------
  // 8. Transactions (Mint docs + Transaction docs)
  // -------------------------------------------------------------------------

  interface TxRowWithSource {
    row: TablesInsert<"transactions">;
    path: string;
    bucket: "Mint" | "Transaction";
  }
  const txRows: TxRowWithSource[] = [];

  for (const mint of mints) {
    const path = `Mint/${mint.id}`;
    const assetNftId = asNumber(mint.data["assetId"]);
    const assetUuid = assetNftId !== null ? assetIdByNftId.get(assetNftId) : undefined;
    if (!assetUuid) {
      recordError("Mint", `${path}: assetId ${String(mint.data["assetId"])} did not resolve to a migrated asset`);
      continue;
    }
    const minterWallet = asString(mint.data["minterId"]);
    const quantity = asNumber(mint.data["mintSupply"]);
    const price = asNumber(mint.data["mintPrice"]);
    txRows.push({
      path,
      bucket: "Mint",
      row: {
        id: deterministicUuid(`mint:${mint.id}`),
        type: "mint",
        asset_id: assetUuid,
        to_user_id: resolveUser(minterWallet),
        to_wallet: minterWallet ? lowerWallet(minterWallet) : null,
        quantity: quantity !== null ? roundQty(quantity) : null,
        price_per_fraction: price,
        total: quantity !== null && price !== null ? quantity * price : null,
        fee: asNumber(mint.data["mintFee"]) ?? 0,
        fee_currency: asString(mint.data["mintCurrency"]) ?? "USDC",
        tx_hash: asString(mint.data["txHash"]),
        created_at: toIso(mint.data["createdAt"]) ?? undefined,
      },
    });
  }

  for (const tx of transactions) {
    const path = `Transaction/${tx.id}`;
    const assetNftId = asNumber(tx.data["assetId"]);
    const assetUuid = assetNftId !== null ? (assetIdByNftId.get(assetNftId) ?? null) : null;
    if (assetNftId !== null && assetUuid === null) {
      warn(`${path}: assetId ${assetNftId} did not resolve to a migrated asset, migrated with asset_id null`);
    }
    const fromWallet = asString(tx.data["fromWallet"]);
    const toWallet = asString(tx.data["toWallet"]);
    const quantity = asNumber(tx.data["quantity"]);
    const price = asNumber(tx.data["pricePerFraction"]);
    const fee = asNumber(tx.data["fee"]);
    txRows.push({
      path,
      bucket: "Transaction",
      row: {
        id: deterministicUuid(`tx:${tx.id}`),
        // Legacy semantics: purchase rows carry the platform fee, transfers write fee 0.
        type: fee !== null && fee > 0 ? "buy" : "transfer",
        asset_id: assetUuid,
        from_user_id: resolveUser(fromWallet),
        to_user_id: resolveUser(toWallet),
        from_wallet: fromWallet ? lowerWallet(fromWallet) : null,
        to_wallet: toWallet ? lowerWallet(toWallet) : null,
        quantity: quantity !== null ? roundQty(quantity) : null,
        price_per_fraction: price,
        total: quantity !== null && price !== null ? quantity * price : null,
        fee,
        fee_currency: asString(tx.data["feeCurrency"]) ?? "USDC",
        tx_hash: asString(tx.data["txHash"]),
        created_at: toIso(tx.data["date"]) ?? undefined,
        // The legacy `listingId` field held the Asset doc id, not a listing id.
        // It is intentionally not mapped to transactions.listing_id.
      },
    });
  }

  // transactions has unique (tx_hash, log_index). Legacy purchases write one
  // Transaction doc per fill source sharing one txHash, so assign a stable
  // log_index inside each tx_hash group with more than one row.
  const byTxHash = new Map<string, TxRowWithSource[]>();
  for (const tx of txRows) {
    const hash = tx.row.tx_hash;
    if (!hash) continue;
    const group = byTxHash.get(hash) ?? [];
    group.push(tx);
    byTxHash.set(hash, group);
  }
  for (const group of byTxHash.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => String(a.row.id).localeCompare(String(b.row.id)));
    group.forEach((tx, index) => {
      tx.row.log_index = index;
    });
  }
  for (const { row } of txRows) preview("transactions", row);

  if (dryRun) {
    for (const { bucket } of txRows) stat(bucket).upserted += 1;
  } else {
    for (const bucket of ["Mint", "Transaction"] as const) {
      const rows = txRows.filter((t) => t.bucket === bucket);
      if (rows.length === 0) continue;
      const outcome = await writeRows(
        rows.map((t) => t.row),
        async (chunk) => {
          const { data, error } = await supabase.from("transactions").upsert(chunk, { onConflict: "id" }).select("id");
          return { data, error };
        },
        (row) => `transaction ${String(row.id)} (tx_hash=${String(row.tx_hash)})`,
      );
      stat(bucket).upserted += outcome.written;
      stat(bucket).errors += outcome.failedRows;
      errorMessages.push(...outcome.errorMessagesLocal.map((m) => `[${bucket}] ${m}`));
    }
  }
  for (const { row, path } of txRows) {
    if (row.id) idMap.transactions[path] = row.id;
  }

  // -------------------------------------------------------------------------
  // 9. id map, dry-run preview, summary
  // -------------------------------------------------------------------------

  const idMapPath = join(outputDir, "id-map.json");
  writeFileSync(idMapPath, JSON.stringify(idMap, null, 2));
  console.log(`[migrate] id map written to ${idMapPath}${dryRun ? " (dry run: uuids are placeholders)" : ""}`);

  if (dryRun) {
    console.log("\n===== DRY RUN: first 2 mapped rows per target table =====");
    for (const [table, rows] of Object.entries(previewRows)) {
      console.log(`\n--- ${table} ---`);
      console.log(JSON.stringify(rows.slice(0, 2), null, 2));
    }
  }

  if (warningMessages.length > 0) {
    console.log(`\n===== Warnings (${warningMessages.length}) =====`);
    for (const message of warningMessages) console.log(`  warn: ${message}`);
  }
  if (errorMessages.length > 0) {
    console.log(`\n===== Errors (${errorMessages.length}) =====`);
    for (const message of errorMessages) console.log(`  error: ${message}`);
  }

  console.log("\n===== Summary =====");
  const header = ["firestore collection", "docs read", "upserted", "skipped", "errors"];
  const rows = [...statsByCollection.values()].map((s) => [
    s.collection,
    String(s.docsRead),
    String(s.upserted),
    String(s.skipped),
    String(s.errors),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)));
  const renderRow = (cells: string[]): string =>
    cells.map((cell, i) => cell.padEnd(widths[i] ?? cell.length)).join("  ");
  console.log(renderRow(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(renderRow(row));

  const totalErrors = [...statsByCollection.values()].reduce((n, s) => n + s.errors, 0);
  if (totalErrors > 0) {
    console.error(`\n[migrate] finished with ${totalErrors} error(s).`);
    process.exit(1);
  }
  console.log(`\n[migrate] done${dryRun ? " (dry run, nothing was written to Supabase)" : ""}.`);
}

main().catch((err: unknown) => {
  console.error("[migrate] unhandled failure:", err);
  process.exit(1);
});
