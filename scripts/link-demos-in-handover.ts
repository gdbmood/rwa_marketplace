/**
 * Replaces the VIDEO_LINK_PENDING placeholders in docs/handover/HANDOVER.md
 * with links to the recorded demo videos.
 *
 * Matching is explicit rather than fuzzy: MAPPING below pairs each function
 * inventory row (by its exact label in the handover table) with the slug part
 * of the video filename produced by scripts/make-demos.ts. A row with no
 * recording keeps a plain "none" so the document never links to a file that
 * does not exist, and the script fails if any placeholder is left behind, so a
 * silent gap cannot ship.
 *
 * Run after `npm run demos`, then re-render the PDF with `npm run handover:pdf`.
 */

import './lib/bootstrap';

import { promises as fs } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const HANDOVER = path.join(REPO_ROOT, 'docs', 'handover', 'HANDOVER.md');
const DEMOS_DIR = path.join(REPO_ROOT, 'docs', 'demos');

/**
 * Section-scoped mappings: function label in the handover to the distinctive
 * part of the video slug. Scoping matters because several labels ("Register",
 * "Complete profile", "Settings") appear in BOTH the business and the investor
 * table, and a flat map would link the investor rows to the business clips.
 * Several functions are demonstrated inside one journey clip, so the same
 * video legitimately appears against more than one row.
 */
type Mapping = Array<[string, string]>;

const BUSINESS_MAPPING: Mapping = [
  ['Register', 'business-registers-on-first-login'],
  ['Complete profile', 'business-completes-the-business-profile'],
  ['Sumsub KYB verification, webhook flips is_verified', 'is-verified-through-the-signed-sumsub'],
  ['Create draft listing', 'creates-a-draft-listing'],
  ['Edit draft listing', 'edits-the-draft'],
  ['Upload images and documents', 'creates-a-draft-listing'],
  ['Mint and list (primary listing)', 'mints-and-lists-the-asset'],
  ['Dashboard with own assets, listings, sales and buyers', 'sales-view-on-the-dashboard'],
  ['Update listing metadata', 'updates-the-listing-metadata'],
  ['Update primary price', 'updates-the-listing-metadata'],
  ['Delist remaining fractions', 'delists-the-remaining-fractions'],
  ['See transactions and revenue', 'transactions-and-revenue'],
  ['Settings', 'business-persists-settings-updates'],
];

const INVESTOR_MAPPING: Mapping = [
  ['Register', 'investor-registers-through-test-auth'],
  ['Complete profile', 'investor-registers-through-test-auth'],
  ['Optional Sumsub KYC verification', 'kyc-gate-blocks-an-unverified-buyer'],
  ['Browse marketplace', 'browses-the-marketplace'],
  ['Filter by class and per-class fields', 'browses-the-marketplace'],
  ['View asset and documents', 'opens-the-asset-detail-page'],
  ['Buy with USDC', 'buys-with-usdc'],
  ['Buy with card via on-ramp', 'buys-with-card-through-the-mock-onramp'],
  [
    'KYC-gated asset blocked when unverified, allowed when verified',
    'kyc-gate-blocks-an-unverified-buyer',
  ],
  ['Portfolio with holdings and average entry price', 'buys-with-usdc'],
  ['List fractions for sale (resale)', 'lists-fractions-for-resale'],
  ['Update resale listing price', 'updates-the-resale-listing-price'],
  ['Unlist', 'unlists-the-resale-listing'],
  ['Transfer fractions to another user', 'transfers-fractions-to-another-user'],
  ['Transaction history', 'transaction-history-lists-every-operation'],
  ['Settings', 'investor-settings-preferences-persist'],
  ['Display currency conversion', 'display-currency-changes-the-prices'],
  ['Logout and login again with state intact', 'logs-out-and-back-in'],
];

const SYSTEM_MAPPING: Mapping = [
  ['browser was closed', 'full-journey'],
  ['concurrent', 'losing-buyer-sees-a-clear-failure'],
  ['RLS', 'rls-blocks-cross-user-holdings-reads'],
];

/** Headings that delimit the three inventory tables, in document order. */
const SECTIONS: Array<{ heading: string; mapping: Mapping }> = [
  { heading: '### Business functions', mapping: BUSINESS_MAPPING },
  { heading: '### Investor functions', mapping: INVESTOR_MAPPING },
  { heading: '### System guarantees', mapping: SYSTEM_MAPPING },
];

/** Escapes a literal for use inside a RegExp source string. */
function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main(): Promise<void> {
  const files = (await fs.readdir(DEMOS_DIR)).filter((name) => name.endsWith('.mp4'));
  if (files.length === 0) {
    throw new Error(`no mp4 files in ${DEMOS_DIR}. Record first: npm run demos`);
  }

  const find = (needle: string): string | null =>
    files.find((name) => name.includes(needle)) ?? null;

  let markdown = await fs.readFile(HANDOVER, 'utf8');
  const unmatched: string[] = [];
  let linked = 0;

  // Work section by section: each table is sliced out, rewritten, and put
  // back, so a label that exists in two tables can never pull the other
  // table's video.
  for (const [index, section] of SECTIONS.entries()) {
    const start = markdown.indexOf(section.heading);
    if (start === -1) {
      unmatched.push(`section heading "${section.heading}" not found`);
      continue;
    }
    const nextHeading = SECTIONS[index + 1]?.heading;
    const rawEnd = nextHeading ? markdown.indexOf(nextHeading, start) : -1;
    // The last section ends at the next top level heading, not at the file end.
    const fallbackEnd = markdown.indexOf('\n## ', start);
    const end =
      rawEnd !== -1 ? rawEnd : fallbackEnd !== -1 ? fallbackEnd : markdown.length;

    let slice = markdown.slice(start, end);

    for (const [label, needle] of section.mapping) {
      const file = find(needle);
      if (!file) {
        unmatched.push(`${label} (no video matching "${needle}")`);
        continue;
      }
      const rowPattern = new RegExp(
        `(\\|[^|\\n]*${escapeForRegExp(label)}[^|\\n]*\\|[^|\\n]*\\|\\s*)VIDEO_LINK_PENDING`,
        'g',
      );
      const before = slice;
      slice = slice.replace(
        rowPattern,
        (_match, prefix: string) => `${prefix}[${file}](../demos/${file})`,
      );
      if (slice !== before) {
        linked += 1;
      } else {
        unmatched.push(`${label} (no VIDEO_LINK_PENDING row in ${section.heading})`);
      }
    }

    markdown = markdown.slice(0, start) + slice + markdown.slice(end);
  }

  const leftover = (markdown.match(/VIDEO_LINK_PENDING/g) ?? []).length;
  await fs.writeFile(HANDOVER, markdown, 'utf8');

  console.log(`[handover] linked ${linked} function row(s) to demo videos`);
  if (unmatched.length > 0) {
    console.warn(`[handover] unmatched:\n  ${unmatched.join('\n  ')}`);
  }
  if (leftover > 0) {
    throw new Error(
      `${leftover} VIDEO_LINK_PENDING placeholder(s) remain in the handover; ` +
        'extend MAPPING in scripts/link-demos-in-handover.ts or set the cell to "none" ' +
        'if the function genuinely has no recording.',
    );
  }
}

main().catch((error) => {
  console.error('[handover]', error instanceof Error ? error.message : error);
  process.exit(1);
});
