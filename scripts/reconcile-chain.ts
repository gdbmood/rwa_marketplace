/**
 * Chain vs database reconciliation report.
 *
 * Usage:
 *   npx tsx scripts/reconcile-chain.ts [--chain-id <id>] [--rpc <url>] [--json]
 *
 * Checks:
 *   - every holdings row against balanceOf(wallet) on the asset's fraction
 *     token (the chain is authoritative for balances),
 *   - every primary listing against fetchAllListings (price) and the
 *     issuer's on-chain balance (quantity upper bound; the resale order book
 *     has no getter, see docs/audit/contracts.md section 4).
 *
 * Prints a diff table (or JSON with --json) and exits nonzero when any
 * unexplained diff exists. A diff is "explained" (pending) when unprocessed
 * chain_events rows still exist for the chain, because the indexer simply has
 * not caught up yet.
 *
 * Tokens with no code on the target chain are skipped (and counted) instead
 * of failing the whole report: the seed writes fixture assets with fake token
 * addresses on purpose (nft ids 9001/9002, so UI work needs no chain), and a
 * fresh local hardhat node orphans tokens minted on a previous node. A
 * balanceOf call on such an address can only throw; there is nothing on chain
 * to reconcile those rows against.
 */

import './lib/bootstrap';
import { eth_getCode } from 'thirdweb/rpc';
import { createServiceClient } from '../src/lib/supabase/server';
import { unwrap } from '../src/lib/db/helpers';
import { usdcToMicro, microToUsdc } from '../src/lib/indexer/core';
import {
  type IndexerChainContext,
  balanceOfOnChain,
  createIndexerChainContext,
  fetchAllListingsOnChain,
} from '../src/lib/indexer/chain';

interface CliOptions {
  chainId?: number;
  rpcUrl?: string;
  json: boolean;
}

interface DiffRow {
  kind: 'holding' | 'primary_listing_price' | 'primary_listing_quantity' | 'primary_listing_missing';
  asset: string;
  wallet: string;
  db: string;
  chain: string;
  status: 'DIFF' | 'PENDING';
  note: string;
}

const tokenCodeCache = new Map<string, boolean>();

/** True when the address holds contract code on the target chain (cached). */
async function tokenHasCode(ctx: IndexerChainContext, token: string): Promise<boolean> {
  const key = token.toLowerCase();
  const cached = tokenCodeCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let hasCode = false;
  try {
    const code = await eth_getCode(ctx.rpc, { address: key as `0x${string}` });
    hasCode = typeof code === 'string' && code !== '0x' && code !== '0x0';
  } catch {
    hasCode = false;
  }
  tokenCodeCache.set(key, hasCode);
  return hasCode;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--chain-id') {
      const value = Number.parseInt(argv[i + 1] ?? '', 10);
      if (Number.isNaN(value)) {
        throw new Error('--chain-id requires an integer value');
      }
      options.chainId = value;
      i += 1;
    } else if (arg === '--rpc') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--rpc requires a URL value');
      }
      options.rpcUrl = value;
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printTable(rows: DiffRow[]): void {
  if (rows.length === 0) {
    console.log('No differences found. Database matches the chain.');
    return;
  }
  const headers = ['kind', 'asset', 'wallet', 'db', 'chain', 'status', 'note'];
  const table = rows.map((row) => [
    row.kind,
    row.asset,
    row.wallet,
    row.db,
    row.chain,
    row.status,
    row.note,
  ]);
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...table.map((row) => row[i].length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i])).join('  ');
  console.log(line(headers));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const row of table) {
    console.log(line(row));
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const ctx = createIndexerChainContext({
    ...(options.chainId !== undefined ? { chainId: options.chainId } : {}),
    ...(options.rpcUrl !== undefined ? { rpcUrl: options.rpcUrl } : {}),
  });
  const db = createServiceClient();
  const diffs: DiffRow[] = [];

  // Explained-diff detection: unprocessed events mean the indexer is behind.
  const pendingResult = await db
    .from('chain_events')
    .select('id')
    .eq('chain_id', ctx.chainId)
    .eq('processed', false)
    .limit(1);
  const hasPendingEvents = unwrap(pendingResult, 'reconcile.pendingEvents').length > 0;

  const assetsResult = await db
    .from('assets')
    .select('id, name, nft_id, erc20_token_address, business_id, chain_id, status')
    .eq('chain_id', ctx.chainId)
    .not('erc20_token_address', 'is', null);
  const assets = unwrap(assetsResult, 'reconcile.assets');
  type AssetSlice = (typeof assets)[number];
  const assetById = new Map(assets.map((a): [string, AssetSlice] => [a.id, a]));
  const assetByNftId = new Map(
    assets
      .filter((a) => a.nft_id !== null)
      .map((a): [number, AssetSlice] => [a.nft_id as number, a]),
  );

  const usersResult = await db.from('users').select('id, wallet_address');
  const users = unwrap(usersResult, 'reconcile.users');
  const walletById = new Map(users.map((u): [string, string] => [u.id, u.wallet_address]));

  // 1. Holdings vs balanceOf ---------------------------------------------------

  const holdingsResult = await db.from('holdings').select('*');
  const holdings = unwrap(holdingsResult, 'reconcile.holdings');
  let checkedHoldings = 0;
  const skippedTokensWithoutCode = new Set<string>();

  for (const holding of holdings) {
    const asset = assetById.get(holding.asset_id);
    if (!asset || !asset.erc20_token_address) {
      continue; // draft asset, nothing on chain to compare against
    }
    const wallet = walletById.get(holding.user_id);
    if (!wallet) {
      continue;
    }
    if (!(await tokenHasCode(ctx, asset.erc20_token_address))) {
      // Seed fixture token or an orphan of a previous local node: nothing on
      // this chain to reconcile against (see the header comment).
      skippedTokensWithoutCode.add(asset.erc20_token_address.toLowerCase());
      continue;
    }
    checkedHoldings += 1;
    const balance = await balanceOfOnChain(ctx, asset.erc20_token_address, wallet);
    const dbQuantity = BigInt(holding.quantity);
    if (balance !== dbQuantity) {
      diffs.push({
        kind: 'holding',
        asset: asset.name,
        wallet,
        db: dbQuantity.toString(),
        chain: balance.toString(),
        status: hasPendingEvents ? 'PENDING' : 'DIFF',
        note: hasPendingEvents ? 'unprocessed chain_events exist' : 'balance mismatch',
      });
    }
  }

  // 2. Primary listings vs fetchAllListings ------------------------------------

  const listingsResult = await db
    .from('listings')
    .select('*')
    .eq('kind', 'primary')
    .eq('status', 'active');
  const primaryListings = unwrap(listingsResult, 'reconcile.primaryListings');
  type ListingSlice = (typeof primaryListings)[number];
  const primaryByAssetId = new Map(
    primaryListings.map((l): [string, ListingSlice] => [l.asset_id, l]),
  );

  const chainListings = await fetchAllListingsOnChain(ctx);
  let checkedListings = 0;

  for (const chainListing of chainListings) {
    if (!chainListing.isFractionalized) {
      continue;
    }
    const asset = assetByNftId.get(chainListing.nftId);
    if (!asset) {
      diffs.push({
        kind: 'primary_listing_missing',
        asset: `nft ${chainListing.nftId}`,
        wallet: chainListing.nftOwner,
        db: 'absent',
        chain: 'listed',
        status: hasPendingEvents ? 'PENDING' : 'DIFF',
        note: 'chain listing has no matching asset row',
      });
      continue;
    }
    const primary = primaryByAssetId.get(asset.id);
    if (!primary) {
      // No active primary listing: legitimate when fully sold out, and when
      // the issuer delisted (unlistFractions drains the resale book but the
      // nfts[] entry stays isFractionalized forever; the contract has no
      // on-chain delist state to compare against).
      if (asset.status !== 'sold_out' && asset.status !== 'delisted') {
        diffs.push({
          kind: 'primary_listing_missing',
          asset: asset.name,
          wallet: chainListing.nftOwner,
          db: 'absent',
          chain: 'listed',
          status: hasPendingEvents ? 'PENDING' : 'DIFF',
          note: `asset status is ${asset.status}, no active primary listing`,
        });
      }
      continue;
    }
    checkedListings += 1;

    const dbPriceMicro = usdcToMicro(String(primary.price_per_fraction));
    if (dbPriceMicro !== chainListing.pricePerFractionMicro) {
      diffs.push({
        kind: 'primary_listing_price',
        asset: asset.name,
        wallet: chainListing.nftOwner,
        db: microToUsdc(dbPriceMicro),
        chain: microToUsdc(chainListing.pricePerFractionMicro),
        status: hasPendingEvents ? 'PENDING' : 'DIFF',
        note: 'price drift (run the indexer reconcile pass)',
      });
    }

    const businessWallet = walletById.get(asset.business_id);
    if (businessWallet) {
      const balance = await balanceOfOnChain(ctx, chainListing.erc20TokenAddress, businessWallet);
      if (BigInt(primary.quantity) > balance) {
        diffs.push({
          kind: 'primary_listing_quantity',
          asset: asset.name,
          wallet: businessWallet,
          db: String(primary.quantity),
          chain: balance.toString(),
          status: hasPendingEvents ? 'PENDING' : 'DIFF',
          note: 'listed quantity exceeds issuer balance',
        });
      }
    }
  }

  const unexplained = diffs.filter((d) => d.status === 'DIFF');

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          chainId: ctx.chainId,
          checkedHoldings,
          checkedListings,
          hasPendingEvents,
          skippedTokensWithoutCode: [...skippedTokensWithoutCode],
          diffs,
          unexplained: unexplained.length,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `Reconcile chain ${ctx.chainId}: ${checkedHoldings} holdings, ${checkedListings} primary listings checked.`,
    );
    if (skippedTokensWithoutCode.size > 0) {
      console.log(
        `Note: ${skippedTokensWithoutCode.size} token(s) without code on this chain were skipped (seed fixtures or orphans of a previous local node).`,
      );
    }
    if (hasPendingEvents) {
      console.log('Note: unprocessed chain_events exist; diffs are marked PENDING.');
    }
    printTable(diffs);
  }

  if (unexplained.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
