/**
 * Unit tests for the pure indexer core: settlement math, fill planning,
 * idempotent replay, and each event handler against mocked repositories
 * (IndexerDeps is dependency-injected, so no module mocking is needed).
 */

import {
  AWAITING_ORDER_MARKER,
  type CoreChainEvent,
  type IndexerAsset,
  type IndexerDeps,
  type IndexerListing,
  type TransferLogRecord,
  ZERO_ADDRESS,
  handleErc20Transfer,
  handleFractionBought,
  handleNftFractionalized,
  handleRoyaltyDistributed,
  microToUsdc,
  planFills,
  processChainEvent,
  prorateFee,
  usdcToMicro,
} from '@/lib/indexer/core';

const BUSINESS_WALLET = '0x2000000000000000000000000000000000000001';
const BUYER_WALLET = '0x3000000000000000000000000000000000000001';
const SELLER2_WALLET = '0x3000000000000000000000000000000000000002';
const TOKEN = '0x4000000000000000000000000000000000009001';
const TX_HASH = `0x${'ab'.repeat(32)}`;

const ASSET: IndexerAsset = {
  id: 'asset-1',
  nftId: 1,
  businessId: 'user-business',
  businessWallet: BUSINESS_WALLET,
  status: 'active',
  erc20TokenAddress: TOKEN,
  totalSupply: 1000,
  availableSupply: 1000,
  mintPricePerFraction: '25',
  chainId: 31337,
  mintTxHash: `0x${'11'.repeat(32)}`,
};

function listing(overrides: Partial<IndexerListing>): IndexerListing {
  return {
    id: 'listing-1',
    assetId: ASSET.id,
    listerId: 'user-business',
    kind: 'primary',
    quantity: 1000,
    pricePerFraction: '25',
    status: 'active',
    ...overrides,
  };
}

function event(overrides: Partial<CoreChainEvent>): CoreChainEvent {
  return {
    chainId: 31337,
    contractAddress: '0x5000000000000000000000000000000000000001',
    eventName: 'FractionBought',
    txHash: TX_HASH,
    blockNumber: 100,
    logIndex: 7,
    args: {},
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<IndexerDeps> = {}): jest.Mocked<IndexerDeps> {
  const deps: IndexerDeps = {
    getAssetByErc20: jest.fn().mockResolvedValue(null),
    getAssetByMintTxHash: jest.fn().mockResolvedValue(null),
    getOldestMintingAssetForWallet: jest.fn().mockResolvedValue(null),
    promoteAssetToActive: jest.fn().mockResolvedValue(null),
    updateAssetSupply: jest.fn().mockResolvedValue(undefined),
    setAssetStatus: jest.fn().mockResolvedValue(undefined),
    getUserByWallet: jest.fn().mockResolvedValue(null),
    getActiveListingsForAsset: jest.fn().mockResolvedValue([]),
    createListing: jest.fn().mockResolvedValue(listing({})),
    decrementListingQuantity: jest.fn().mockResolvedValue(listing({})),
    getHolding: jest.fn().mockResolvedValue(null),
    applyHoldingDelta: jest.fn().mockResolvedValue({
      id: 'holding-1',
      userId: 'u',
      assetId: ASSET.id,
      quantity: 1,
      lockedQuantity: 0,
    }),
    lockHoldingQuantity: jest.fn().mockResolvedValue(null),
    unlockHoldingQuantity: jest.fn().mockResolvedValue(null),
    getOrderByTxHash: jest.fn().mockResolvedValue(null),
    settleOrder: jest.fn().mockResolvedValue(null),
    createChainDirectOrder: jest.fn().mockResolvedValue(null),
    recordTransaction: jest.fn().mockResolvedValue(undefined),
    transactionExists: jest.fn().mockResolvedValue(false),
    writeAudit: jest.fn().mockResolvedValue(undefined),
    getTransferLogsForTx: jest.fn().mockResolvedValue([]),
    hasFractionBoughtInTx: jest.fn().mockResolvedValue(false),
    getTxSender: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  return deps as jest.Mocked<IndexerDeps>;
}

describe('money helpers', () => {
  it('converts micro USDC to numeric strings and back', () => {
    expect(microToUsdc(BigInt(0))).toBe('0');
    expect(microToUsdc(BigInt(1500000))).toBe('1.5');
    expect(microToUsdc(BigInt(25))).toBe('0.000025');
    expect(microToUsdc(BigInt('123456789012345'))).toBe('123456789.012345');

    expect(usdcToMicro('1.5')).toBe(BigInt(1500000));
    expect(usdcToMicro('25')).toBe(BigInt(25000000));
    expect(usdcToMicro('12.500000')).toBe(BigInt(12500000));
    expect(usdcToMicro('0.000025')).toBe(BigInt(25));
  });

  it('round trips arbitrary micro amounts', () => {
    const samples = ['1', '999999', '1000000', '123456789012345'].map((s) => BigInt(s));
    for (const sample of samples) {
      expect(usdcToMicro(microToUsdc(sample))).toBe(sample);
    }
  });
});

describe('prorateFee', () => {
  it('splits proportionally and gives the remainder to the last fill', () => {
    const fees = prorateFee('1', ['10', '20']);
    expect(fees).toHaveLength(2);
    const total = usdcToMicro(fees[0] as string) + usdcToMicro(fees[1] as string);
    expect(total).toBe(usdcToMicro('1'));
    expect(usdcToMicro(fees[0] as string)).toBe(usdcToMicro('0.333333'));
    expect(usdcToMicro(fees[1] as string)).toBe(usdcToMicro('0.666667'));
  });

  it('keeps null totals as null fees', () => {
    const fees = prorateFee('1', ['10', null]);
    expect(fees[0]).toBe('1');
    expect(fees[1]).toBeNull();
  });
});

describe('planFills', () => {
  const sellerIds = new Map<string, string | null>([
    [BUSINESS_WALLET, 'user-business'],
    [SELLER2_WALLET, 'user-seller2'],
  ]);

  it('consumes a seller listing and computes exact totals', () => {
    const { fills, shortfalls } = planFills(
      [listing({ quantity: 100, pricePerFraction: '25' })],
      [{ from: BUSINESS_WALLET, to: BUYER_WALLET, value: BigInt(10), logIndex: 3 }],
      sellerIds,
    );
    expect(shortfalls).toHaveLength(0);
    expect(fills).toHaveLength(1);
    expect(fills[0].quantity).toBe(10);
    expect(fills[0].total).toBe('250');
    expect(fills[0].pricePerFraction).toBe('25');
    expect(fills[0].parts).toEqual([
      { listingId: 'listing-1', quantity: 10, priceMicro: usdcToMicro('25') },
    ]);
  });

  it('fills a multi-listing seller cheapest first', () => {
    const { fills } = planFills(
      [
        listing({ id: 'expensive', quantity: 50, pricePerFraction: '30', kind: 'secondary' }),
        listing({ id: 'cheap', quantity: 5, pricePerFraction: '20', kind: 'secondary' }),
      ],
      [{ from: BUSINESS_WALLET, to: BUYER_WALLET, value: BigInt(8), logIndex: 2 }],
      sellerIds,
    );
    expect(fills[0].parts).toEqual([
      { listingId: 'cheap', quantity: 5, priceMicro: usdcToMicro('20') },
      { listingId: 'expensive', quantity: 3, priceMicro: usdcToMicro('30') },
    ]);
    // 5 * 20 + 3 * 30 = 190; weighted price 190 / 8 = 23.75
    expect(fills[0].total).toBe('190');
    expect(fills[0].pricePerFraction).toBe('23.75');
  });

  it('keeps sellers separate across transfer logs', () => {
    const { fills } = planFills(
      [
        listing({ id: 'l-business', quantity: 100, pricePerFraction: '25' }),
        listing({
          id: 'l-seller2',
          listerId: 'user-seller2',
          kind: 'secondary',
          quantity: 40,
          pricePerFraction: '24',
        }),
      ],
      [
        { from: SELLER2_WALLET, to: BUYER_WALLET, value: BigInt(40), logIndex: 1 },
        { from: BUSINESS_WALLET, to: BUYER_WALLET, value: BigInt(10), logIndex: 2 },
      ],
      sellerIds,
    );
    expect(fills[0].parts[0].listingId).toBe('l-seller2');
    expect(fills[0].total).toBe('960');
    expect(fills[1].parts[0].listingId).toBe('l-business');
    expect(fills[1].total).toBe('250');
  });

  it('reports shortfalls when no listing covers a transfer', () => {
    const { fills, shortfalls } = planFills(
      [listing({ quantity: 4 })],
      [{ from: BUSINESS_WALLET, to: BUYER_WALLET, value: BigInt(10), logIndex: 5 }],
      sellerIds,
    );
    expect(shortfalls).toEqual([{ logIndex: 5, sellerWallet: BUSINESS_WALLET, missing: 6 }]);
    expect(fills[0].total).toBeNull();
    expect(fills[0].parts).toHaveLength(1);
  });
});

describe('handleFractionBought', () => {
  const boughtEvent = event({
    eventName: 'FractionBought',
    args: { buyer: BUYER_WALLET, erc20Token: TOKEN, amount: '10', pricePaid: '250000000' },
  });
  const transferLog: TransferLogRecord = {
    from: BUSINESS_WALLET,
    to: BUYER_WALLET,
    value: BigInt(10),
    logIndex: 3,
  };

  it('settles a submitted order end to end', async () => {
    const primary = listing({ quantity: 1000, pricePerFraction: '25' });
    const deps = createMockDeps({
      getAssetByErc20: jest.fn().mockResolvedValue(ASSET),
      getTransferLogsForTx: jest.fn().mockResolvedValue([transferLog]),
      getUserByWallet: jest.fn(async (wallet: string) =>
        wallet === BUYER_WALLET
          ? { id: 'user-buyer', walletAddress: BUYER_WALLET }
          : wallet === BUSINESS_WALLET
            ? { id: 'user-business', walletAddress: BUSINESS_WALLET }
            : null,
      ),
      getActiveListingsForAsset: jest.fn().mockResolvedValue([primary]),
      getOrderByTxHash: jest.fn().mockResolvedValue({
        id: 'order-1',
        buyerId: 'user-buyer',
        assetId: ASSET.id,
        quantity: 10,
        status: 'submitted',
        txHash: TX_HASH,
        quotedTotal: '250',
        platformFee: '0.25',
      }),
      settleOrder: jest.fn().mockResolvedValue({ id: 'order-1', status: 'settled' }),
      getHolding: jest.fn().mockResolvedValue({
        id: 'holding-biz',
        userId: 'user-business',
        assetId: ASSET.id,
        quantity: 1000,
        lockedQuantity: 1000,
      }),
    });

    const result = await handleFractionBought(boughtEvent, deps);
    expect(result.outcome).toBe('processed');

    expect(deps.decrementListingQuantity).toHaveBeenCalledWith('listing-1', 10);
    expect(deps.unlockHoldingQuantity).toHaveBeenCalledWith('user-business', ASSET.id, 10);
    expect(deps.applyHoldingDelta).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-business', deltaQuantity: -10 }),
    );
    expect(deps.applyHoldingDelta).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-buyer', deltaQuantity: 10, priceForAvg: '25' }),
    );
    expect(deps.recordTransaction).toHaveBeenCalledTimes(1);
    expect(deps.recordTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'buy',
        orderId: 'order-1',
        listingId: 'listing-1',
        quantity: 10,
        pricePerFraction: '25',
        total: '250',
        fee: '0.25',
        txHash: TX_HASH,
        logIndex: 3,
      }),
    );
    expect(deps.updateAssetSupply).toHaveBeenCalledWith(ASSET.id, 990);
    expect(deps.setAssetStatus).not.toHaveBeenCalled();
    expect(deps.settleOrder).toHaveBeenCalledWith('order-1', expect.objectContaining({ txHash: TX_HASH }));
    expect(deps.createChainDirectOrder).not.toHaveBeenCalled();
  });

  it('splits multi-seller fills per transfer log with prorated fees', async () => {
    const listings = [
      listing({ id: 'l-cheap', listerId: 'user-seller2', kind: 'secondary', quantity: 40, pricePerFraction: '20' }),
      listing({ id: 'l-primary', quantity: 1000, pricePerFraction: '25' }),
    ];
    const logs: TransferLogRecord[] = [
      { from: SELLER2_WALLET, to: BUYER_WALLET, value: BigInt(40), logIndex: 1 },
      { from: BUSINESS_WALLET, to: BUYER_WALLET, value: BigInt(60), logIndex: 2 },
    ];
    // 40 * 20 + 60 * 25 = 2300 USDC paid
    const deps = createMockDeps({
      getAssetByErc20: jest.fn().mockResolvedValue(ASSET),
      getTransferLogsForTx: jest.fn().mockResolvedValue(logs),
      getUserByWallet: jest.fn(async (wallet: string) =>
        wallet === BUYER_WALLET
          ? { id: 'user-buyer', walletAddress: BUYER_WALLET }
          : wallet === SELLER2_WALLET
            ? { id: 'user-seller2', walletAddress: SELLER2_WALLET }
            : { id: 'user-business', walletAddress: BUSINESS_WALLET },
      ),
      getActiveListingsForAsset: jest.fn().mockResolvedValue(listings),
      getOrderByTxHash: jest.fn().mockResolvedValue({
        id: 'order-2',
        buyerId: 'user-buyer',
        assetId: ASSET.id,
        quantity: 100,
        status: 'submitted',
        txHash: TX_HASH,
        quotedTotal: '2300',
        platformFee: '2.3',
      }),
      settleOrder: jest.fn().mockResolvedValue({ id: 'order-2', status: 'settled' }),
    });

    const result = await handleFractionBought(
      event({
        eventName: 'FractionBought',
        args: { buyer: BUYER_WALLET, erc20Token: TOKEN, amount: '100', pricePaid: '2300000000' },
      }),
      deps,
    );
    expect(result.outcome).toBe('processed');

    expect(deps.decrementListingQuantity).toHaveBeenCalledWith('l-cheap', 40);
    expect(deps.decrementListingQuantity).toHaveBeenCalledWith('l-primary', 60);
    expect(deps.recordTransaction).toHaveBeenCalledTimes(2);

    const calls = (deps.recordTransaction as jest.Mock).mock.calls.map((c) => c[0]);
    const fillA = calls.find((c) => c.logIndex === 1);
    const fillB = calls.find((c) => c.logIndex === 2);
    expect(fillA).toMatchObject({ quantity: 40, total: '800', fromWallet: SELLER2_WALLET });
    expect(fillB).toMatchObject({ quantity: 60, total: '1500', fromWallet: BUSINESS_WALLET });
    // Fees add up exactly to the order's platform fee.
    const feeSum = usdcToMicro(fillA.fee) + usdcToMicro(fillB.fee);
    expect(feeSum).toBe(usdcToMicro('2.3'));
    // No listing drift: totals match pricePaid, so no drift audit entry.
    const auditActions = (deps.writeAudit as jest.Mock).mock.calls.map((c) => c[0].action);
    expect(auditActions).not.toContain('indexer.buy_listing_drift');
  });

  it('marks the asset sold_out when available supply reaches zero', async () => {
    const smallAsset: IndexerAsset = { ...ASSET, availableSupply: 10 };
    const deps = createMockDeps({
      getAssetByErc20: jest.fn().mockResolvedValue(smallAsset),
      getTransferLogsForTx: jest.fn().mockResolvedValue([transferLog]),
      getUserByWallet: jest.fn(async () => ({ id: 'user-business', walletAddress: BUSINESS_WALLET })),
      getActiveListingsForAsset: jest.fn().mockResolvedValue([listing({ quantity: 10 })]),
    });

    // No order row exists: the first sight defers one cycle (grace for a
    // racing submitOrderTx), the retry with the marker settles for real.
    const result = await handleFractionBought(
      { ...boughtEvent, previousError: AWAITING_ORDER_MARKER },
      deps,
    );
    expect(result.outcome).toBe('processed');
    expect(deps.updateAssetSupply).toHaveBeenCalledWith(ASSET.id, 0);
    expect(deps.setAssetStatus).toHaveBeenCalledWith(ASSET.id, 'sold_out');
  });

  it('creates a settled order when the browser closed before submitOrderTx', async () => {
    const deps = createMockDeps({
      getAssetByErc20: jest.fn().mockResolvedValue(ASSET),
      getTransferLogsForTx: jest.fn().mockResolvedValue([transferLog]),
      getUserByWallet: jest.fn(async (wallet: string) =>
        wallet === BUYER_WALLET
          ? { id: 'user-buyer', walletAddress: BUYER_WALLET }
          : { id: 'user-business', walletAddress: BUSINESS_WALLET },
      ),
      getActiveListingsForAsset: jest.fn().mockResolvedValue([listing({})]),
      getOrderByTxHash: jest.fn().mockResolvedValue(null),
      createChainDirectOrder: jest.fn().mockResolvedValue({ id: 'order-new', status: 'submitted' }),
    });

    // First sight without an order row: one-cycle grace, nothing mutated.
    const deferred = await handleFractionBought(boughtEvent, deps);
    expect(deferred.outcome).toBe('retry');
    expect(deferred.detail).toContain(AWAITING_ORDER_MARKER);
    expect(deps.decrementListingQuantity).not.toHaveBeenCalled();
    expect(deps.recordTransaction).not.toHaveBeenCalled();
    expect(deps.createChainDirectOrder).not.toHaveBeenCalled();

    // Retry after the grace cycle (marker recorded on the event row).
    const result = await handleFractionBought(
      { ...boughtEvent, previousError: deferred.detail },
      deps,
    );
    expect(result.outcome).toBe('processed');
    expect(deps.createChainDirectOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerId: 'user-buyer',
        assetId: ASSET.id,
        quantity: 10,
        quotedTotal: '250',
        txHash: TX_HASH,
      }),
    );
    expect(deps.settleOrder).toHaveBeenCalledWith('order-new', expect.objectContaining({ txHash: TX_HASH }));
  });

  it('is idempotent: replayed fills apply no mutations', async () => {
    const deps = createMockDeps({
      getAssetByErc20: jest.fn().mockResolvedValue(ASSET),
      getTransferLogsForTx: jest.fn().mockResolvedValue([transferLog]),
      getUserByWallet: jest.fn(async () => ({ id: 'user-buyer', walletAddress: BUYER_WALLET })),
      getActiveListingsForAsset: jest.fn().mockResolvedValue([listing({})]),
      transactionExists: jest.fn().mockResolvedValue(true),
      getOrderByTxHash: jest.fn().mockResolvedValue({
        id: 'order-1',
        buyerId: 'user-buyer',
        assetId: ASSET.id,
        quantity: 10,
        status: 'settled',
        txHash: TX_HASH,
        quotedTotal: '250',
        platformFee: '0.25',
      }),
    });

    const result = await handleFractionBought(boughtEvent, deps);
    expect(result.outcome).toBe('skipped');
    expect(deps.decrementListingQuantity).not.toHaveBeenCalled();
    expect(deps.applyHoldingDelta).not.toHaveBeenCalled();
    expect(deps.recordTransaction).not.toHaveBeenCalled();
    expect(deps.updateAssetSupply).not.toHaveBeenCalled();
  });

  it('retries when the mint event has not been processed yet', async () => {
    const deps = createMockDeps({ getAssetByErc20: jest.fn().mockResolvedValue(null) });
    const result = await handleFractionBought(boughtEvent, deps);
    expect(result.outcome).toBe('retry');
  });
});

describe('handleNftFractionalized', () => {
  const mintEvent = event({
    eventName: 'NFTFractionalized',
    contractAddress: '0x5000000000000000000000000000000000000001',
    txHash: `0x${'11'.repeat(32)}`,
    logIndex: 0,
    args: { nftId: '1', erc20TokenAddress: TOKEN, totalSupply: '1000', pricePerFraction: '25000000' },
  });

  it('promotes the asset, seeds the holding, lists and records the mint', async () => {
    const mintingAsset: IndexerAsset = { ...ASSET, status: 'minting', erc20TokenAddress: null };
    const deps = createMockDeps({
      getAssetByErc20: jest.fn().mockResolvedValue(null),
      getAssetByMintTxHash: jest.fn().mockResolvedValue(mintingAsset),
      promoteAssetToActive: jest.fn().mockResolvedValue(ASSET),
      getHolding: jest.fn().mockResolvedValue(null),
      applyHoldingDelta: jest.fn().mockResolvedValue({
        id: 'holding-biz',
        userId: 'user-business',
        assetId: ASSET.id,
        quantity: 1000,
        lockedQuantity: 0,
      }),
    });

    const result = await handleNftFractionalized(mintEvent, deps);
    expect(result.outcome).toBe('processed');

    expect(deps.promoteAssetToActive).toHaveBeenCalledWith(ASSET.id, {
      nftId: 1,
      erc20TokenAddress: TOKEN,
      totalSupply: 1000,
      mintTxHash: mintEvent.txHash,
    });
    expect(deps.applyHoldingDelta).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-business', deltaQuantity: 1000, priceForAvg: '25' }),
    );
    expect(deps.lockHoldingQuantity).toHaveBeenCalledWith('user-business', ASSET.id, 1000);
    expect(deps.createListing).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: ASSET.id,
        listerId: 'user-business',
        kind: 'primary',
        quantity: 1000,
        pricePerFraction: '25',
      }),
    );
    expect(deps.recordTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mint', quantity: 1000, total: '25000', logIndex: 0 }),
    );
  });

  it('falls back to the oldest minting asset of the tx sender', async () => {
    const deps = createMockDeps({
      getAssetByMintTxHash: jest.fn().mockResolvedValue(null),
      getTxSender: jest.fn().mockResolvedValue(BUSINESS_WALLET),
      getOldestMintingAssetForWallet: jest.fn().mockResolvedValue({ ...ASSET, status: 'minting' }),
      promoteAssetToActive: jest.fn().mockResolvedValue(ASSET),
      getHolding: jest.fn().mockResolvedValue({
        id: 'h',
        userId: 'user-business',
        assetId: ASSET.id,
        quantity: 1000,
        lockedQuantity: 1000,
      }),
      getActiveListingsForAsset: jest.fn().mockResolvedValue([listing({})]),
    });

    const result = await handleNftFractionalized(mintEvent, deps);
    expect(result.outcome).toBe('processed');
    expect(deps.getOldestMintingAssetForWallet).toHaveBeenCalledWith(BUSINESS_WALLET);
    // Holding and listing already exist: no double seeding.
    expect(deps.applyHoldingDelta).not.toHaveBeenCalled();
    expect(deps.createListing).not.toHaveBeenCalled();
  });

  it('skips when the asset is already promoted (replay)', async () => {
    const deps = createMockDeps({ getAssetByErc20: jest.fn().mockResolvedValue(ASSET) });
    const result = await handleNftFractionalized(mintEvent, deps);
    expect(result.outcome).toBe('skipped');
    expect(deps.promoteAssetToActive).not.toHaveBeenCalled();
    expect(deps.recordTransaction).not.toHaveBeenCalled();
  });

  it('retries when no asset matches the mint', async () => {
    const deps = createMockDeps();
    const result = await handleNftFractionalized(mintEvent, deps);
    expect(result.outcome).toBe('retry');
  });
});

describe('handleErc20Transfer', () => {
  const transferEvent = event({
    eventName: 'Transfer',
    contractAddress: TOKEN,
    logIndex: 4,
    args: { from: BUYER_WALLET, to: SELLER2_WALLET, value: '5' },
  });

  it('adjusts both holdings and records a transfer transaction', async () => {
    const deps = createMockDeps({
      getAssetByErc20: jest.fn().mockResolvedValue(ASSET),
      getUserByWallet: jest.fn(async (wallet: string) =>
        wallet === BUYER_WALLET
          ? { id: 'user-buyer', walletAddress: BUYER_WALLET }
          : { id: 'user-seller2', walletAddress: SELLER2_WALLET },
      ),
      getHolding: jest.fn().mockResolvedValue({
        id: 'h',
        userId: 'user-buyer',
        assetId: ASSET.id,
        quantity: 10,
        lockedQuantity: 0,
      }),
    });

    const result = await handleErc20Transfer(transferEvent, deps);
    expect(result.outcome).toBe('processed');
    expect(deps.applyHoldingDelta).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-buyer', deltaQuantity: -5 }),
    );
    expect(deps.applyHoldingDelta).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-seller2', deltaQuantity: 5 }),
    );
    expect(deps.recordTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transfer',
        fromWallet: BUYER_WALLET,
        toWallet: SELLER2_WALLET,
        quantity: 5,
        fee: '0',
        logIndex: 4,
      }),
    );
  });

  it('skips transfers that belong to a buy transaction', async () => {
    const deps = createMockDeps({
      getAssetByErc20: jest.fn().mockResolvedValue(ASSET),
      hasFractionBoughtInTx: jest.fn().mockResolvedValue(true),
    });
    const result = await handleErc20Transfer(transferEvent, deps);
    expect(result.outcome).toBe('skipped');
    expect(deps.applyHoldingDelta).not.toHaveBeenCalled();
    expect(deps.recordTransaction).not.toHaveBeenCalled();
  });

  it('skips mint transfers and already recorded transfers', async () => {
    const deps = createMockDeps({ getAssetByErc20: jest.fn().mockResolvedValue(ASSET) });
    const mint = await handleErc20Transfer(
      event({
        eventName: 'Transfer',
        contractAddress: TOKEN,
        args: { from: ZERO_ADDRESS, to: BUYER_WALLET, value: '1000' },
      }),
      deps,
    );
    expect(mint.outcome).toBe('skipped');

    const replayDeps = createMockDeps({
      getAssetByErc20: jest.fn().mockResolvedValue(ASSET),
      transactionExists: jest.fn().mockResolvedValue(true),
    });
    const replay = await handleErc20Transfer(transferEvent, replayDeps);
    expect(replay.outcome).toBe('skipped');
    expect(replayDeps.applyHoldingDelta).not.toHaveBeenCalled();
  });

  it('unlocks the deficit when listed fractions are moved off-wallet', async () => {
    const deps = createMockDeps({
      getAssetByErc20: jest.fn().mockResolvedValue(ASSET),
      getUserByWallet: jest.fn(async (wallet: string) =>
        wallet === BUYER_WALLET ? { id: 'user-buyer', walletAddress: BUYER_WALLET } : null,
      ),
      getHolding: jest.fn().mockResolvedValue({
        id: 'h',
        userId: 'user-buyer',
        assetId: ASSET.id,
        quantity: 10,
        lockedQuantity: 8,
      }),
    });

    // Sending 5 leaves 5 unlockable but 8 locked: deficit of 3 must unlock.
    const result = await handleErc20Transfer(transferEvent, deps);
    expect(result.outcome).toBe('processed');
    expect(deps.unlockHoldingQuantity).toHaveBeenCalledWith('user-buyer', ASSET.id, 3);
  });
});

describe('handleRoyaltyDistributed', () => {
  it('writes an audit entry and no transactions row', async () => {
    const deps = createMockDeps({ getAssetByErc20: jest.fn().mockResolvedValue(ASSET) });
    const result = await handleRoyaltyDistributed(
      event({
        eventName: 'RoyaltyDistributed',
        args: { erc20Token: TOKEN, amount: '1000000000000000000', timestamp: '1750000000' },
      }),
      deps,
    );
    expect(result.outcome).toBe('processed');
    expect(deps.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'indexer.royalty_distributed', entityId: ASSET.id }),
    );
    expect(deps.recordTransaction).not.toHaveBeenCalled();
  });
});

describe('processChainEvent', () => {
  it('skips unknown events', async () => {
    const deps = createMockDeps();
    const result = await processChainEvent(event({ eventName: 'OwnershipTransferred' }), deps);
    expect(result.outcome).toBe('skipped');
  });

  it('skips malformed args with an audit trail instead of poisoning the queue', async () => {
    const deps = createMockDeps();
    const result = await processChainEvent(
      event({ eventName: 'FractionBought', args: { buyer: 'not-an-address' } }),
      deps,
    );
    expect(result.outcome).toBe('skipped');
    expect(deps.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'indexer.malformed_event_args' }),
    );
  });
});
