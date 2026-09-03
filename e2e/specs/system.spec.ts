/**
 * SYSTEM guarantee specs. These do not test screens; they test the promises
 * the architecture makes regardless of what any browser does
 * (docs/architecture/IMPLEMENTATION_PLAN.md, "Source of truth rules" and
 * "Order state machine"):
 *
 *   1. The indexer reconciles a purchase completed while the browser was
 *      closed: the buy is driven straight against the chain from node (viem),
 *      the app is never told, and the indexer alone must produce the settled
 *      order, the holdings moves, the listing decrement and the transactions
 *      ledger rows.
 *   2. Two investors racing for the last fractions: two pre-signed
 *      buyFractions transactions for the same final N are broadcast
 *      concurrently; the chain reverts one, exactly one order settles and the
 *      other is failed with a clear message. A second test drives the losing
 *      buyer through the real buy flow UI (the loser's buyFractions RPC is
 *      parked at the network edge while the rival lands the same purchase, a
 *      deterministic interleaving of a genuine race) and asserts the UI
 *      renders the failure.
 *   3. RLS blocks cross-user holdings reads with the anon key plus a real RLS
 *      JWT minted by GET /api/rls-token, while anonymous readers still see
 *      active listings and zero holdings.
 *
 * Tests run serially (shared chain plus shared remote database) and each
 * chain-heavy test mints its OWN fresh asset through the real contract, so a
 * retry re-runs against fresh rows, per e2e/README.md.
 *
 * Chain access: viem, resolved from the root node_modules (it ships as a
 * dependency of thirdweb v5; the version in the tree is what thirdweb itself
 * runs on). Raw legacy transactions are signed locally so their hashes are
 * known BEFORE broadcast, which lets the spec attach tx hashes to order rows
 * first (exactly what submitOrderTx does) and eliminates every race between
 * the 2s-poll indexer and the spec's own writes.
 *
 * Cross-run hygiene (ensureStackHygiene): the remote database survives across
 * runs while the local hardhat node may not. On a fresh node the deploy is
 * deterministic, so a new run's first mint reuses the nft id and token
 * address of a previous run's asset and the indexer would mis-match the
 * event. The hygiene pass detects rows whose token has no code on the current
 * chain (a token cannot disappear from a chain, so no code means the chain
 * was reset) and neutralizes them, rewinds an indexer cursor that points past
 * the current tip, and deletes unprocessed chain_events whose transaction no
 * longer exists. Seeded fixture assets (metadata.seeded, fake tokens by
 * design) are left alone; scripts/reconcile-chain.ts skips codeless tokens
 * for the same reason.
 */

// fixtures first: its import of scripts/lib/bootstrap stubs 'server-only'
// and loads .env.local before anything from src/ is touched.
import { expect, test, type ServiceDb, type TestWallet } from '../fixtures';
import type { Route } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  createPublicClient,
  decodeEventLog,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  toFunctionSelector,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CHAIN_ID, CHAIN_RPC_URL, readChainJson, rpcCall, type ChainJson } from '../stack';
import { microToUsdc } from '../../src/lib/indexer/core';
import type { Database, Json } from '../../src/types/database';

const RPC_ORIGIN = 'http://127.0.0.1:8545';

const MARKETPLACE_ABI = parseAbi([
  'function mintAndFractionalizeNFT(uint256 totalSupply, uint256 pricePerFraction, string metadata) returns (uint256)',
  'function buyFractions(uint256 nftId, uint256 amount)',
  'function platformFee() view returns (uint256)',
  'event NFTFractionalized(uint256 indexed nftId, address erc20TokenAddress, uint256 totalSupply, uint256 pricePerFraction)',
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);

/** 4-byte selector of buyFractions, used to spot its RPC calls in test 2b. */
const BUY_SELECTOR = toFunctionSelector('function buyFractions(uint256 nftId, uint256 amount)');

const publicClient = createPublicClient({ transport: http(CHAIN_RPC_URL) });

// -- small helpers -----------------------------------------------------------

/** Postgres numeric columns: typed number, sent as strings (see src/lib/db/numeric.ts). */
function num(value: string): number {
  return value as unknown as number;
}

function addr(value: string): `0x${string}` {
  return value.toLowerCase() as `0x${string}`;
}

/**
 * Unwraps a supabase response or throws with a labelled message. Generic over
 * the whole response object (not just T): under this repo's `bundler` module
 * resolution, inferring T from the discriminated-union responses collapses to
 * null, while binding the full response type keeps the row types intact.
 */
function must<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  label: string,
): NonNullable<R['data']> {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`${label}: no data returned`);
  }
  return result.data as NonNullable<R['data']>;
}

function requireChainJson(): ChainJson {
  const chain = readChainJson();
  if (!chain) {
    throw new Error('e2e/.chain.json is missing. Run the suite through `npm run e2e`.');
  }
  return chain;
}

// -- raw transaction plumbing ------------------------------------------------

interface SignedTx {
  raw: Hex;
  hash: Hex;
}

/**
 * Signs a legacy transaction locally and returns the raw payload plus its
 * hash. Knowing the hash before broadcast is the backbone of these specs: it
 * lets order rows carry tx_hash (status submitted) before the chain, and
 * therefore the indexer, ever sees the transaction.
 */
async function signTx(
  wallet: TestWallet,
  to: string,
  data: Hex,
  gas: bigint,
): Promise<SignedTx> {
  const account = privateKeyToAccount(wallet.privateKey as Hex);
  const [nonce, gasPrice] = await Promise.all([
    publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' }),
    publicClient.getGasPrice(),
  ]);
  const raw = await account.signTransaction({
    type: 'legacy',
    chainId: CHAIN_ID,
    to: addr(to),
    data,
    gas,
    gasPrice: gasPrice * BigInt(2),
    nonce,
    value: BigInt(0),
  });
  return { raw, hash: keccak256(raw) };
}

interface BroadcastResult {
  accepted: boolean;
  /** The node's error text; hardhat embeds the revert reason here. */
  error: string | null;
}

async function broadcastRaw(raw: Hex): Promise<BroadcastResult> {
  try {
    await rpcCall<string>('eth_sendRawTransaction', [raw]);
    return { accepted: true, error: null };
  } catch (error) {
    return { accepted: false, error: error instanceof Error ? error.message : String(error) };
  }
}

type ReceiptOutcome = 'success' | 'reverted' | 'missing';

/**
 * Final status of a transaction: hardhat (automine) mines reverting
 * transactions while erroring the send call, so a hash can resolve to a
 * reverted receipt or, when the node rejected it outright, to no receipt.
 */
async function receiptStatus(hash: Hex, timeoutMs = 15_000): Promise<ReceiptOutcome> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      return receipt.status === 'success' ? 'success' : 'reverted';
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return 'missing';
}

/** Sign, broadcast and require on-chain success. */
async function sendTx(wallet: TestWallet, to: string, data: Hex, gas: bigint): Promise<Hex> {
  const { raw, hash } = await signTx(wallet, to, data, gas);
  const sent = await broadcastRaw(raw);
  if (!sent.accepted) {
    throw new Error(`transaction rejected by the node: ${sent.error}`);
  }
  const status = await receiptStatus(hash);
  if (status !== 'success') {
    throw new Error(`transaction ${hash} ended ${status}`);
  }
  return hash;
}

function buyCalldata(nftId: number, quantity: number): Hex {
  return encodeFunctionData({
    abi: MARKETPLACE_ABI,
    functionName: 'buyFractions',
    args: [BigInt(nftId), BigInt(quantity)],
  });
}

// -- cross-run hygiene -------------------------------------------------------

let hygieneDone = false;

async function ensureStackHygiene(db: ServiceDb): Promise<void> {
  if (hygieneDone) {
    return;
  }
  const chain = requireChainJson();
  const latest = Number.parseInt(await rpcCall<string>('eth_blockNumber'), 16);
  const marketplace = chain.marketplace.toLowerCase();

  // 1. An indexer cursor past the current tip proves the node was reset since
  //    the last run; rewind it to the tip so new events are ingested at all.
  const cursor = await db
    .from('indexer_cursors')
    .select('last_block')
    .eq('chain_id', CHAIN_ID)
    .eq('contract_address', marketplace)
    .maybeSingle();
  if (cursor.error) {
    throw new Error(`hygiene.cursor: ${cursor.error.message}`);
  }
  if (cursor.data && Number(cursor.data.last_block) > latest) {
    const rewound = await db
      .from('indexer_cursors')
      .update({ last_block: latest })
      .eq('chain_id', CHAIN_ID)
      .eq('contract_address', marketplace);
    if (rewound.error) {
      throw new Error(`hygiene.cursorRewind: ${rewound.error.message}`);
    }
  }

  // 2. Unprocessed chain_events whose transaction no longer exists on this
  //    chain can never be processed and would keep hasPendingEvents true in
  //    the reconcile report forever. Delete the orphans.
  const pending = await db
    .from('chain_events')
    .select('id, tx_hash')
    .eq('chain_id', CHAIN_ID)
    .eq('processed', false)
    .limit(500);
  if (pending.error) {
    throw new Error(`hygiene.pendingEvents: ${pending.error.message}`);
  }
  const txExists = new Map<string, boolean>();
  const orphanIds: string[] = [];
  for (const row of pending.data ?? []) {
    let exists = txExists.get(row.tx_hash);
    if (exists === undefined) {
      const tx = await rpcCall<unknown>('eth_getTransactionByHash', [row.tx_hash]);
      exists = tx !== null;
      txExists.set(row.tx_hash, exists);
    }
    if (!exists) {
      orphanIds.push(row.id);
    }
  }
  if (orphanIds.length > 0) {
    const deleted = await db.from('chain_events').delete().in('id', orphanIds);
    if (deleted.error) {
      throw new Error(`hygiene.deleteOrphans: ${deleted.error.message}`);
    }
  }

  // 3. Assets whose fraction token has no code on the current chain are
  //    leftovers of a previous node (deterministic deploys reuse nft ids and
  //    token addresses, so these rows would collide with fresh mints).
  //    Neutralize them; seeded fixture assets (fake tokens by design) stay.
  const assets = await db
    .from('assets')
    .select('id, erc20_token_address, metadata')
    .eq('chain_id', CHAIN_ID)
    .not('erc20_token_address', 'is', null);
  if (assets.error) {
    throw new Error(`hygiene.assets: ${assets.error.message}`);
  }
  for (const row of assets.data ?? []) {
    const meta = row.metadata as { seeded?: unknown } | null;
    if (meta && meta.seeded === true) {
      continue;
    }
    if (!row.erc20_token_address) {
      continue;
    }
    const code = await rpcCall<string>('eth_getCode', [row.erc20_token_address, 'latest']);
    if (code !== '0x' && code !== '0x0') {
      continue;
    }
    const neutralized = await db
      .from('assets')
      .update({ nft_id: null, erc20_token_address: null, status: 'delisted' })
      .eq('id', row.id);
    if (neutralized.error) {
      throw new Error(`hygiene.neutralize(${row.id}): ${neutralized.error.message}`);
    }
    const canceled = await db
      .from('listings')
      .update({ status: 'canceled' })
      .eq('asset_id', row.id)
      .eq('status', 'active');
    if (canceled.error) {
      throw new Error(`hygiene.cancelListings(${row.id}): ${canceled.error.message}`);
    }
  }

  // 4. Draft or minting leftovers of previous aborted runs of THIS suite
  //    would otherwise be candidates for the indexer's oldest-minting-asset
  //    fallback match. Delist them.
  const delisted = await db
    .from('assets')
    .update({ status: 'delisted' })
    .eq('chain_id', CHAIN_ID)
    .eq('metadata->>e2e_suite', 'system')
    .in('status', ['draft', 'minting']);
  if (delisted.error) {
    throw new Error(`hygiene.delistStale: ${delisted.error.message}`);
  }

  hygieneDone = true;
}

// -- on-chain asset factory --------------------------------------------------

interface MintedAsset {
  assetId: string;
  nftId: number;
  /** Lowercased fraction token address. */
  token: string;
  mintTxHash: Hex;
  businessUserId: string;
  marketplace: string;
  usdc: string;
  totalSupply: number;
  priceMicro: bigint;
  feeBps: bigint;
}

/**
 * Full mint path against the real contract: draft asset row, the
 * draft-to-minting transition carrying the (pre-computed) mint tx hash, the
 * on-chain mintAndFractionalizeNFT, then a wait for the indexer to promote
 * the asset, seed the issuer holding and create the primary listing. Finishes
 * with the issuer's fraction-token approval, which buyFractions requires from
 * every seller.
 */
async function mintAssetOnChain(
  db: ServiceDb,
  business: TestWallet,
  opts: { name: string; totalSupply: number; priceMicro: bigint },
): Promise<MintedAsset> {
  const chain = requireChainJson();
  const businessUser = await db.userByWallet(business.address);
  if (!businessUser) {
    throw new Error(`No users row for ${business.address}; did scripts/seed.ts run?`);
  }

  const categories = must(
    await db.from('asset_categories').select('id').limit(1),
    'mint.categories',
  );
  if (categories.length === 0) {
    throw new Error('No asset categories; apply the supabase migrations first.');
  }

  const internalId = `e2e-system-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const assetRow = must(
    await db
      .from('assets')
      .insert({
        business_id: businessUser.id,
        category_id: categories[0].id,
        chain_id: CHAIN_ID,
        name: opts.name,
        status: 'draft',
        description: 'Created by e2e/specs/system.spec.ts',
        internal_id: internalId,
        total_supply: opts.totalSupply,
        mint_price_per_fraction: num(microToUsdc(opts.priceMicro)),
        kyc_required: false,
        metadata: { e2e_suite: 'system', internal_id: internalId } as Json,
      })
      .select('*')
      .single(),
    'mint.insertDraft',
  );

  const mintData = encodeFunctionData({
    abi: MARKETPLACE_ABI,
    functionName: 'mintAndFractionalizeNFT',
    args: [
      BigInt(opts.totalSupply),
      opts.priceMicro,
      JSON.stringify({ name: opts.name, e2e: internalId }),
    ],
  });
  const mint = await signTx(business, chain.marketplace, mintData, BigInt(8_000_000));

  // Record minting BEFORE broadcasting: the tx hash of a locally signed
  // transaction is known up front, so the indexer's primary match
  // (getAssetByMintTxHash) can never lose the race against the 2s poll.
  must(
    await db
      .from('assets')
      .update({ status: 'minting', mint_tx_hash: mint.hash })
      .eq('id', assetRow.id)
      .eq('status', 'draft')
      .select('id')
      .single(),
    'mint.setMinting',
  );

  const sent = await broadcastRaw(mint.raw);
  if (!sent.accepted) {
    throw new Error(`mintAndFractionalizeNFT rejected: ${sent.error}`);
  }
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: mint.hash,
    timeout: 30_000,
  });
  if (receipt.status !== 'success') {
    throw new Error(`mintAndFractionalizeNFT reverted (tx ${mint.hash})`);
  }

  let nftId: number | null = null;
  let token: string | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== chain.marketplace.toLowerCase()) {
      continue;
    }
    try {
      const decoded = decodeEventLog({
        abi: MARKETPLACE_ABI,
        data: log.data,
        topics: log.topics,
        eventName: 'NFTFractionalized',
      });
      nftId = Number(decoded.args.nftId);
      token = decoded.args.erc20TokenAddress.toLowerCase();
      break;
    } catch {
      continue;
    }
  }
  if (nftId === null || token === null) {
    throw new Error(`No NFTFractionalized event in mint receipt ${mint.hash}`);
  }

  // Stale rows claiming this nft id or token would send the indexer to the
  // wrong asset. ensureStackHygiene neutralizes them up front; this is the
  // loud failure if something slipped through.
  const clash = must(
    await db
      .from('assets')
      .select('id, name, status')
      .eq('chain_id', CHAIN_ID)
      .neq('id', assetRow.id)
      .or(`nft_id.eq.${nftId},erc20_token_address.eq.${token}`),
    'mint.clashCheck',
  );
  expect(
    clash,
    `stale asset rows claim nft ${nftId} or token ${token}; cross-run hygiene failed`,
  ).toEqual([]);

  // The indexer (2s poll) must promote the asset, seed the issuer holding and
  // create the primary listing entirely on its own.
  await expect
    .poll(
      async () => {
        const row = await db
          .from('assets')
          .select('status, nft_id, erc20_token_address')
          .eq('id', assetRow.id)
          .maybeSingle();
        if (row.error || !row.data) {
          return 'row-missing';
        }
        return row.data.status === 'active' &&
          row.data.nft_id === nftId &&
          row.data.erc20_token_address === token
          ? 'promoted'
          : row.data.status;
      },
      {
        timeout: 90_000,
        intervals: [1500],
        message: `indexer never promoted asset ${assetRow.id} (mint ${mint.hash}); check e2e/.pids/indexer.log`,
      },
    )
    .toBe('promoted');

  await expect
    .poll(
      async () => {
        const listings = must(
          await db
            .from('listings')
            .select('quantity, kind, status')
            .eq('asset_id', assetRow.id)
            .eq('kind', 'primary')
            .eq('status', 'active'),
          'mint.primaryListing',
        );
        return listings.length === 1 ? listings[0].quantity : -1;
      },
      { timeout: 60_000, intervals: [1500], message: 'primary listing was not created' },
    )
    .toBe(opts.totalSupply);

  // buyFractions pulls fractions via transferFrom, so the issuer must have
  // approved the marketplace (the app does the same in its mint flow).
  await sendTx(
    business,
    token,
    encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [addr(chain.marketplace), BigInt(opts.totalSupply)],
    }),
    BigInt(200_000),
  );

  const feeBps = await publicClient.readContract({
    address: addr(chain.marketplace),
    abi: MARKETPLACE_ABI,
    functionName: 'platformFee',
  });

  return {
    assetId: assetRow.id,
    nftId,
    token,
    mintTxHash: mint.hash,
    businessUserId: businessUser.id,
    marketplace: chain.marketplace,
    usdc: chain.usdc,
    totalSupply: opts.totalSupply,
    priceMicro: opts.priceMicro,
    feeBps,
  };
}

function quoteMicro(minted: MintedAsset, quantity: number): { totalMicro: bigint; feeMicro: bigint } {
  const totalMicro = minted.priceMicro * BigInt(quantity);
  const feeMicro = (totalMicro * minted.feeBps) / BigInt(10_000);
  return { totalMicro, feeMicro };
}

/** Approves exactly the USDC that buyFractions will pull (price plus fee). */
async function approveUsdcFor(
  buyer: TestWallet,
  minted: MintedAsset,
  quantity: number,
): Promise<void> {
  const { totalMicro, feeMicro } = quoteMicro(minted, quantity);
  await sendTx(
    buyer,
    minted.usdc,
    encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [addr(minted.marketplace), totalMicro + feeMicro],
    }),
    BigInt(200_000),
  );
}

/**
 * Creates an orders row the way createBuyOrder does (status created, quoted
 * total and platform fee from the chain fee rate, 30 minute expiry) and then
 * performs the exact created-to-submitted transition submitOrderTx performs,
 * attaching the pre-computed tx hash. Returns the order id.
 */
async function createSubmittedOrder(
  db: ServiceDb,
  buyerUserId: string,
  minted: MintedAsset,
  quantity: number,
  txHash: Hex,
): Promise<string> {
  const { totalMicro, feeMicro } = quoteMicro(minted, quantity);
  const created = must(
    await db
      .from('orders')
      .insert({
        buyer_id: buyerUserId,
        asset_id: minted.assetId,
        quantity,
        quoted_total: num(microToUsdc(totalMicro)),
        platform_fee: num(microToUsdc(feeMicro)),
        payment_method: 'usdc',
        status: 'created',
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single(),
    'order.insert',
  );
  must(
    await db
      .from('orders')
      .update({ status: 'submitted', tx_hash: txHash })
      .eq('id', created.id)
      .eq('status', 'created')
      .select('id')
      .single(),
    'order.submit',
  );
  return created.id;
}

async function orderStatus(db: ServiceDb, orderId: string): Promise<string> {
  const row = await db.from('orders').select('status').eq('id', orderId).maybeSingle();
  if (row.error || !row.data) {
    return 'absent';
  }
  return row.data.status;
}

async function tokenBalance(minted: MintedAsset, wallet: string): Promise<bigint> {
  return publicClient.readContract({
    address: addr(minted.token),
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [addr(wallet)],
  });
}

// -- the specs ---------------------------------------------------------------

test.describe.serial('system guarantees', () => {
  test('indexer reconciles a purchase completed while the browser was closed', async ({
    db,
    walletFor,
  }) => {
    test.setTimeout(240_000);
    const service = db();
    await ensureStackHygiene(service);

    const business1 = walletFor('business1');
    const investor1 = walletFor('investor1');
    const investor1User = await service.userByWallet(investor1.address);
    expect(investor1User, 'investor1 must be seeded').not.toBeNull();

    const minted = await mintAssetOnChain(service, business1, {
      name: `E2E Ghost Buy ${Date.now()}`,
      totalSupply: 100,
      priceMicro: BigInt(2_000_000), // 2 USDC per fraction
    });

    // The purchase happens with the browser closed: approve plus buyFractions
    // straight against the node. The app never hears about it; there is no
    // orders row and submitOrderTx is never called.
    const quantity = 5;
    await approveUsdcFor(investor1, minted, quantity);
    const buyTxHash = await sendTx(
      investor1,
      minted.marketplace,
      buyCalldata(minted.nftId, quantity),
      BigInt(1_500_000),
    );

    // The indexer alone must record a settled order for the buyer's history.
    await expect
      .poll(
        async () => {
          const rows = must(
            await service.from('orders').select('status').eq('tx_hash', buyTxHash).limit(1),
            'ghost.orderPoll',
          );
          return rows.length === 1 ? rows[0].status : 'absent';
        },
        {
          timeout: 90_000,
          intervals: [1500],
          message: `indexer never settled the browserless buy ${buyTxHash}; check e2e/.pids/indexer.log`,
        },
      )
      .toBe('settled');

    const orders = must(
      await service.from('orders').select('*').eq('tx_hash', buyTxHash),
      'ghost.order',
    );
    expect(orders).toHaveLength(1);
    const order = orders[0];
    expect(order.buyer_id).toBe(investor1User!.id);
    expect(order.asset_id).toBe(minted.assetId);
    expect(order.quantity).toBe(quantity);
    // createSettledOrder marks chain-direct purchases distinctly and records
    // the exact pricePaid from the event as the quoted total.
    expect(order.payment_method).toBe('chain_direct');
    expect(Number(order.quoted_total)).toBe(10);
    expect(order.fills).not.toBeNull();

    // Holdings moved on both sides (issuer holding was fully locked at mint).
    const buyerHolding = must(
      await service
        .from('holdings')
        .select('quantity')
        .eq('user_id', investor1User!.id)
        .eq('asset_id', minted.assetId)
        .maybeSingle(),
      'ghost.buyerHolding',
    );
    expect(buyerHolding.quantity).toBe(quantity);

    const sellerHolding = must(
      await service
        .from('holdings')
        .select('quantity, locked_quantity')
        .eq('user_id', minted.businessUserId)
        .eq('asset_id', minted.assetId)
        .maybeSingle(),
      'ghost.sellerHolding',
    );
    expect(sellerHolding.quantity).toBe(minted.totalSupply - quantity);
    expect(sellerHolding.locked_quantity).toBe(minted.totalSupply - quantity);

    // The primary listing was decremented and the asset supply updated.
    const listings = must(
      await service
        .from('listings')
        .select('quantity, status')
        .eq('asset_id', minted.assetId)
        .eq('kind', 'primary'),
      'ghost.listing',
    );
    expect(listings).toHaveLength(1);
    expect(listings[0].status).toBe('active');
    expect(listings[0].quantity).toBe(minted.totalSupply - quantity);

    const asset = must(
      await service
        .from('assets')
        .select('available_supply, status')
        .eq('id', minted.assetId)
        .maybeSingle(),
      'ghost.asset',
    );
    expect(asset.status).toBe('active');
    expect(asset.available_supply).toBe(minted.totalSupply - quantity);

    // Transactions ledger: one buy row per ERC20 Transfer of the buy tx (a
    // single-seller fill here) plus the mint row from promotion.
    const buyRows = must(
      await service.from('transactions').select('*').eq('tx_hash', buyTxHash).eq('type', 'buy'),
      'ghost.buyTransactions',
    );
    expect(buyRows.length).toBeGreaterThan(0);
    const totalMoved = buyRows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
    expect(totalMoved).toBe(quantity);
    expect(buyRows[0].to_user_id).toBe(investor1User!.id);
    expect(buyRows[0].from_user_id).toBe(minted.businessUserId);
    expect(buyRows[0].order_id).toBe(order.id);

    const mintRows = must(
      await service
        .from('transactions')
        .select('id')
        .eq('tx_hash', minted.mintTxHash)
        .eq('type', 'mint'),
      'ghost.mintTransaction',
    );
    expect(mintRows).toHaveLength(1);

    // Chain truth: the database now mirrors balanceOf.
    expect(await tokenBalance(minted, investor1.address)).toBe(BigInt(quantity));
  });

  test('two concurrent buys for the last fractions settle exactly one order', async ({
    db,
    walletFor,
  }) => {
    test.setTimeout(240_000);
    const service = db();
    await ensureStackHygiene(service);

    const business1 = walletFor('business1');
    const racerA = walletFor('investor1');
    const reducer = walletFor('investor2');
    const racerB = walletFor('investor3');
    const racerAUser = await service.userByWallet(racerA.address);
    const reducerUser = await service.userByWallet(reducer.address);
    const racerBUser = await service.userByWallet(racerB.address);
    expect(racerAUser && reducerUser && racerBUser, 'all investors must be seeded').toBeTruthy();

    const minted = await mintAssetOnChain(service, business1, {
      name: `E2E Last Fractions ${Date.now()}`,
      totalSupply: 10,
      priceMicro: BigInt(1_000_000), // 1 USDC per fraction
    });

    // Reduce the asset to N=3 remaining through the standard order path
    // (created -> submitted -> settled by the indexer), so the race below is
    // genuinely for the last fractions.
    const remaining = 3;
    const reduceBy = minted.totalSupply - remaining;
    await approveUsdcFor(reducer, minted, reduceBy);
    const prelim = await signTx(
      reducer,
      minted.marketplace,
      buyCalldata(minted.nftId, reduceBy),
      BigInt(1_500_000),
    );
    const prelimOrderId = await createSubmittedOrder(
      service,
      reducerUser!.id,
      minted,
      reduceBy,
      prelim.hash,
    );
    const prelimSent = await broadcastRaw(prelim.raw);
    expect(prelimSent.accepted, prelimSent.error ?? '').toBe(true);
    expect(await receiptStatus(prelim.hash)).toBe('success');

    await expect
      .poll(() => orderStatus(service, prelimOrderId), {
        timeout: 90_000,
        intervals: [1500],
        message: 'the reducing order never settled; check e2e/.pids/indexer.log',
      })
      .toBe('settled');

    // The settled order carries fills with the prorated platform fee.
    const prelimOrder = must(
      await service.from('orders').select('*').eq('id', prelimOrderId).maybeSingle(),
      'race.prelimOrder',
    );
    const prelimFills = prelimOrder.fills as Array<{ fee: string | null; quantity: number }> | null;
    expect(prelimFills).not.toBeNull();
    const { feeMicro: prelimFeeMicro } = quoteMicro(minted, reduceBy);
    const prelimFeeTotal = (prelimFills ?? []).reduce(
      (sum, fill) => sum + (fill.fee === null ? 0 : Number(fill.fee)),
      0,
    );
    expect(prelimFeeTotal).toBeCloseTo(Number(microToUsdc(prelimFeeMicro)), 6);

    const reducedListing = must(
      await service
        .from('listings')
        .select('quantity')
        .eq('asset_id', minted.assetId)
        .eq('kind', 'primary')
        .eq('status', 'active')
        .maybeSingle(),
      'race.reducedListing',
    );
    expect(reducedListing.quantity).toBe(remaining);

    // The race: both buyers approve, pre-sign a buy for the same last 3, and
    // attach their tx hashes to their orders exactly as submitOrderTx would.
    // Then both raw transactions are broadcast concurrently; the marketplace
    // contract reverts whichever lands second ("Not enough fractions listed
    // for sale").
    await approveUsdcFor(racerA, minted, remaining);
    await approveUsdcFor(racerB, minted, remaining);
    const txA = await signTx(
      racerA,
      minted.marketplace,
      buyCalldata(minted.nftId, remaining),
      BigInt(1_500_000),
    );
    const txB = await signTx(
      racerB,
      minted.marketplace,
      buyCalldata(minted.nftId, remaining),
      BigInt(1_500_000),
    );
    const orderAId = await createSubmittedOrder(service, racerAUser!.id, minted, remaining, txA.hash);
    const orderBId = await createSubmittedOrder(service, racerBUser!.id, minted, remaining, txB.hash);

    const [sentA, sentB] = await Promise.all([broadcastRaw(txA.raw), broadcastRaw(txB.raw)]);
    const [statusA, statusB] = await Promise.all([
      receiptStatus(txA.hash),
      receiptStatus(txB.hash),
    ]);

    const entries = [
      { wallet: racerA, userId: racerAUser!.id, orderId: orderAId, hash: txA.hash, sent: sentA, status: statusA },
      { wallet: racerB, userId: racerBUser!.id, orderId: orderBId, hash: txB.hash, sent: sentB, status: statusB },
    ];
    const winners = entries.filter((entry) => entry.status === 'success');
    expect(
      winners,
      `exactly one of the concurrent buys must succeed on chain (got ${statusA}/${statusB})`,
    ).toHaveLength(1);
    const winner = winners[0];
    const loser = entries.find((entry) => entry !== winner)!;

    // The chain refused the loser with a readable reason.
    const loserReason = (
      loser.sent.error ?? `transaction ${loser.hash} reverted on chain`
    )
      .split('\n')[0]
      .slice(0, 240);
    expect(loserReason).toMatch(/not enough fractions|revert/i);

    // The winner's order settles through the indexer, keyed by its tx hash.
    await expect
      .poll(() => orderStatus(service, winner.orderId), {
        timeout: 90_000,
        intervals: [1500],
        message: 'the winning order never settled; check e2e/.pids/indexer.log',
      })
      .toBe('settled');

    // The losing browser's error handler calls failOrder(orderId, reason)
    // when the chain call throws (src/components/buy/buy-flow.tsx). No
    // browser drove this buy, so the spec performs the identical guarded
    // transition here; the UI rendering of the failure is covered by the next
    // test.
    const failed = await service
      .from('orders')
      .update({ status: 'failed', failure_reason: loserReason })
      .eq('id', loser.orderId)
      .in('status', ['created', 'submitted'])
      .select('*')
      .maybeSingle();
    expect(failed.error).toBeNull();
    expect(failed.data?.status).toBe('failed');
    expect(String(failed.data?.failure_reason ?? '')).toMatch(/not enough fractions|revert/i);

    // Exactly one settled and one failed order between the two racers.
    const raceOrders = must(
      await service.from('orders').select('*').in('id', [orderAId, orderBId]),
      'race.orders',
    );
    expect(raceOrders.map((row) => row.status).sort()).toEqual(['failed', 'settled']);
    const settledRow = raceOrders.find((row) => row.status === 'settled')!;
    expect(settledRow.tx_hash).toBe(winner.hash);
    expect(settledRow.buyer_id).toBe(winner.userId);

    // Book fully consumed: listing filled, supply zero, asset sold out.
    const finalListing = must(
      await service
        .from('listings')
        .select('quantity, status')
        .eq('asset_id', minted.assetId)
        .eq('kind', 'primary')
        .maybeSingle(),
      'race.finalListing',
    );
    expect(finalListing.quantity).toBe(0);
    expect(finalListing.status).toBe('filled');

    const finalAsset = must(
      await service
        .from('assets')
        .select('available_supply, status')
        .eq('id', minted.assetId)
        .maybeSingle(),
      'race.finalAsset',
    );
    expect(finalAsset.available_supply).toBe(0);
    expect(finalAsset.status).toBe('sold_out');

    // Chain truth: only the winner holds the last fractions, and the ledger
    // has no rows for the losing hash.
    expect(await tokenBalance(minted, winner.wallet.address)).toBe(BigInt(remaining));
    expect(await tokenBalance(minted, loser.wallet.address)).toBe(BigInt(0));
    const loserLedger = must(
      await service.from('transactions').select('id').eq('tx_hash', loser.hash),
      'race.loserLedger',
    );
    expect(loserLedger).toEqual([]);
  });

  test('the losing buyer sees a clear failure message in the buy flow UI', async ({
    db,
    page,
    loginAs,
    walletFor,
  }) => {
    test.setTimeout(240_000);
    const service = db();
    await ensureStackHygiene(service);

    const business1 = walletFor('business1');
    const rival = walletFor('investor3');
    const loserWallet = walletFor('investor1');
    const loserUser = await service.userByWallet(loserWallet.address);
    expect(loserUser, 'investor1 must be seeded').not.toBeNull();

    const minted = await mintAssetOnChain(service, business1, {
      name: `E2E UI Race ${Date.now()}`,
      totalSupply: 2,
      priceMicro: BigInt(1_000_000),
    });

    await loginAs(page, 'investor1');

    // Deterministic interleaving of the race: the loser's buyFractions RPC
    // (its calldata carries the selector, both in eth_estimateGas and inside
    // the signed raw payload) is parked at the network edge while the rival's
    // purchase lands, then released so the chain reverts it. Every other RPC
    // of the buy flow (quote, approve, receipt polling) passes through.
    const selectorNeedle = BUY_SELECTOR.slice(2).toLowerCase();
    const heldRoutes: Route[] = [];
    let holdActive = true;
    await page.route(
      (url) => url.origin === RPC_ORIGIN,
      async (route) => {
        const body = (route.request().postData() ?? '').toLowerCase();
        if (holdActive && body.includes(selectorNeedle)) {
          heldRoutes.push(route);
          return; // parked until the rival's purchase confirms
        }
        await route.continue();
      },
    );

    try {
      await page.goto(`/asset/${minted.assetId}/buy/${minted.totalSupply}`);
      await page.getByRole('button', { name: 'Buy with USDC' }).click();

      // By the time the buyFractions RPC arrives the UI has created its order
      // (createBuyOrder quoted 2 available) and completed the USDC approval:
      // the losing buy is genuinely in flight.
      await expect
        .poll(() => heldRoutes.length, {
          timeout: 60_000,
          message: 'the buy flow never reached its buyFractions call',
        })
        .toBeGreaterThan(0);

      // The rival lands the same purchase directly on chain first.
      await approveUsdcFor(rival, minted, minted.totalSupply);
      await sendTx(
        rival,
        minted.marketplace,
        buyCalldata(minted.nftId, minted.totalSupply),
        BigInt(1_500_000),
      );
    } finally {
      holdActive = false;
      for (const parked of heldRoutes.splice(0)) {
        await parked.continue().catch(() => undefined);
      }
    }

    // Released, the loser's transaction reverts; the buy flow's error handler
    // calls failOrder with the chain error and renders the failed state.
    let failedOrder: { failure_reason: string | null } | null = null;
    await expect
      .poll(
        async () => {
          const rows = must(
            await service
              .from('orders')
              .select('status, failure_reason')
              .eq('asset_id', minted.assetId)
              .eq('buyer_id', loserUser!.id)
              .order('created_at', { ascending: false })
              .limit(1),
            'uiRace.loserOrder',
          );
          if (rows.length === 0) {
            return 'absent';
          }
          failedOrder = rows[0];
          return rows[0].status;
        },
        {
          timeout: 90_000,
          intervals: [1000],
          message: 'the losing UI order never reached status failed',
        },
      )
      .toBe('failed');

    const reason = String(failedOrder!.failure_reason ?? '');
    expect(reason.length, 'the failed order must carry a failure reason').toBeGreaterThan(0);
    expect(reason).toMatch(/not enough fractions|revert|insufficient|exception|failed/i);

    // The same clear message is on screen in the buy flow's failed state.
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /not enough fractions|revert|insufficient|exception|failed/i })
        .first(),
    ).toBeVisible({ timeout: 30_000 });

    // The rival's browserless purchase settles via the indexer and empties
    // the book, which is exactly why the loser was refused.
    await expect
      .poll(
        async () => {
          const row = await service
            .from('assets')
            .select('available_supply')
            .eq('id', minted.assetId)
            .maybeSingle();
          return row.data?.available_supply ?? -1;
        },
        { timeout: 90_000, intervals: [1500], message: 'rival settlement never landed' },
      )
      .toBe(0);
    expect(await tokenBalance(minted, rival.address)).toBe(BigInt(minted.totalSupply));
  });

  test('RLS blocks cross-user holdings reads and anon sees only public data', async ({
    db,
    page,
    loginAs,
    walletFor,
  }) => {
    test.setTimeout(120_000);
    const service = db();
    await ensureStackHygiene(service);

    const investor1 = walletFor('investor1');
    const investor2 = walletFor('investor2');
    const investor1User = await service.userByWallet(investor1.address);
    const investor2User = await service.userByWallet(investor2.address);
    expect(investor1User && investor2User, 'both investors must be seeded').toBeTruthy();

    // Preconditions established by the earlier tests in this serial file:
    // investor1 bought in test 1 and investor2 in test 2, so BOTH have
    // holdings rows. The service role confirming investor2's rows exist is
    // what makes the zero-row cross read below a proof of RLS blocking.
    const ownViaService = must(
      await service.from('holdings').select('id').eq('user_id', investor1User!.id),
      'rls.ownViaService',
    );
    expect(
      ownViaService.length,
      'investor1 should hold fractions after the earlier purchases in this spec',
    ).toBeGreaterThan(0);
    const otherViaService = must(
      await service.from('holdings').select('id').eq('user_id', investor2User!.id),
      'rls.otherViaService',
    );
    expect(
      otherViaService.length,
      'investor2 should hold fractions after the earlier purchases in this spec',
    ).toBeGreaterThan(0);

    // A real RLS JWT for investor1: the production-equivalent session cookie
    // (from /api/test-auth via loginAs) exchanged at GET /api/rls-token.
    await loginAs(page, 'investor1');
    const tokenResponse = await page.context().request.get('/api/rls-token');
    expect(tokenResponse.ok(), `GET /api/rls-token failed (${tokenResponse.status()})`).toBe(true);
    const { token } = (await tokenResponse.json()) as { token: string };
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL missing from .env.local').toBeTruthy();
    expect(anonKey, 'NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env.local').toBeTruthy();

    const authedClient = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Cross-user read: RLS filters silently, so this is zero rows, no error.
    const cross = await authedClient
      .from('holdings')
      .select('*')
      .eq('user_id', investor2User!.id);
    expect(cross.error).toBeNull();
    expect(cross.data).toEqual([]);

    // An unfiltered read only ever surfaces the caller's own rows.
    const unfiltered = await authedClient.from('holdings').select('user_id');
    expect(unfiltered.error).toBeNull();
    expect((unfiltered.data ?? []).length).toBeGreaterThan(0);
    expect(
      (unfiltered.data ?? []).every((row) => row.user_id === investor1User!.id),
    ).toBe(true);

    // Own read returns the rows the service role confirmed exist.
    const own = await authedClient
      .from('holdings')
      .select('*')
      .eq('user_id', investor1User!.id);
    expect(own.error).toBeNull();
    expect((own.data ?? []).length).toBe(ownViaService.length);

    // Plain anon (no JWT): active listings are public, holdings are not.
    const anonClient = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const anonListings = await anonClient
      .from('listings')
      .select('id')
      .eq('status', 'active')
      .limit(10);
    expect(anonListings.error).toBeNull();
    expect((anonListings.data ?? []).length).toBeGreaterThan(0);

    const anonHoldings = await anonClient.from('holdings').select('*').limit(10);
    expect(anonHoldings.error).toBeNull();
    expect(anonHoldings.data).toEqual([]);
  });
});
