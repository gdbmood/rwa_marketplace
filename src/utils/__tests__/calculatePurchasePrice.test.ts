// src/utils/__tests__/calculatePurchasePrice.test.ts
import { calculatePurchasePrice } from '../calculatePurchasePrice';
import { Asset } from '@/types/Asset';
import { NFT } from '@/types/NFT';
import { Listing, ListingState } from '@/types/Listing';

// Mock data
const mockAsset: Asset = {
    _id: 'asset1',
    createdAt: '2024-01-01',
    txHash: '0x123',
    initialSupply: 1000,
    availableSupply: 800,
    assetCategory: 'real-estate',
    minterId: 'minter1',
    pricePerFraction: 10,
};

const mockNFT: NFT = {
    nftOwner: 'owner1',
    nftId: 1,
    metadata: {
        nftName: 'Test NFT',
        imageUrls: ['https://example.com/image.jpg'],
        documentUrls: {},
        description: 'Test description',
    },
    totalSupply: 1000,
    pricePerFraction: 10,
    erc20TokenAddress: '0x123',
    isFractionalized: true,
};

const mockListings: Listing[] = [
    {
        _id: 'listing1',
        assetId: 'asset1',
        listerId: 'seller1',
        quantity: 100,
        pricePerFraction: 12,
        createdAt: new Date('2024-01-01'),
        currency: 'USD',
        state: ListingState.ACTIVE,
    },
    {
        _id: 'listing2',
        assetId: 'asset1',
        listerId: 'seller2',
        quantity: 50,
        pricePerFraction: 10,
        createdAt: new Date('2024-01-01'),
        currency: 'USD',
        state: ListingState.ACTIVE,
    },
    {
        _id: 'listing3',
        assetId: 'asset1',
        listerId: 'seller3',
        quantity: 75,
        pricePerFraction: 15,
        createdAt: new Date('2024-01-01'),
        currency: 'USD',
        state: ListingState.ACTIVE,
    },
];

describe('calculatePurchasePrice', () => {
    describe('valid inputs', () => {
        it('should calculate purchase price with single seller', () => {
            const result = calculatePurchasePrice(mockAsset, mockNFT, mockListings, 30);

            expect(result.sources).toHaveLength(1);
            expect(result.sources[0]).toEqual({
                seller: 'seller2',
                price: 10,
                buyAmount: 30,
            });
            expect(result.finalPrice).toBe(300); // 30 * 10
        });

        it('should calculate purchase price with multiple sellers', () => {
            const result = calculatePurchasePrice(mockAsset, mockNFT, mockListings, 120);

            expect(result.sources).toHaveLength(2);
            expect(result.sources[0]).toEqual({
                seller: 'seller2',
                price: 10,
                buyAmount: 50,
            });
            expect(result.sources[1]).toEqual({
                seller: 'seller1',
                price: 12,
                buyAmount: 70,
            });
            expect(result.finalPrice).toBe(1340); // (50 * 10) + (70 * 12)
        });

        it('should prioritize cheaper sellers', () => {
            const result = calculatePurchasePrice(mockAsset, mockNFT, mockListings, 10);

            expect(result.sources).toHaveLength(1);
            expect(result.sources[0].seller).toBe('seller2'); // cheapest at 10
            expect(result.sources[0].price).toBe(10);
        });

        it('should handle exact quantity match', () => {
            const result = calculatePurchasePrice(mockAsset, mockNFT, mockListings, 50);

            expect(result.sources).toHaveLength(1);
            expect(result.sources[0].buyAmount).toBe(50);
            expect(result.finalPrice).toBe(500); // 50 * 10
        });

        it('should handle buying all available fractions', () => {
            const result = calculatePurchasePrice(mockAsset, mockNFT, mockListings, 225);

            expect(result.sources).toHaveLength(3);
            const totalBought = result.sources.reduce((sum, source) => sum + source.buyAmount, 0);
            expect(totalBought).toBe(225); // 50 + 100 + 75
            expect(result.finalPrice).toBe(2825); // (50*10) + (100*12) + (75*15)
        });
    });

    describe('edge cases', () => {
        it('should handle null asset', () => {
            const result = calculatePurchasePrice(null as any, mockNFT, mockListings, 10);

            expect(result.sources).toEqual([]);
            expect(result.finalPrice).toBe(0);
        });

        it('should handle null NFT', () => {
            const result = calculatePurchasePrice(mockAsset, null as any, mockListings, 10);

            expect(result.sources).toEqual([]);
            expect(result.finalPrice).toBe(0);
        });

        it('should handle zero fractions to buy', () => {
            const result = calculatePurchasePrice(mockAsset, mockNFT, mockListings, 0);

            expect(result.sources).toEqual([]);
            expect(result.finalPrice).toBe(0);
        });

        it('should handle negative fractions to buy', () => {
            const result = calculatePurchasePrice(mockAsset, mockNFT, mockListings, -10);

            expect(result.sources).toEqual([]);
            expect(result.finalPrice).toBe(0);
        });

        it('should handle empty listings', () => {
            const result = calculatePurchasePrice(mockAsset, mockNFT, [], 10);

            expect(result.sources).toEqual([]);
            expect(result.finalPrice).toBe(0);
        });

        it('should handle null listings', () => {
            const result = calculatePurchasePrice(mockAsset, mockNFT, null as any, 10);

            expect(result.sources).toEqual([]);
            expect(result.finalPrice).toBe(0);
        });

        it('should handle listings with zero quantity', () => {
            const listingsWithZero: Listing[] = [
                ...mockListings,
                {
                    _id: 'listing4',
                    assetId: 'asset1',
                    listerId: 'seller4',
                    quantity: 0,
                    pricePerFraction: 5,
                    createdAt: new Date('2024-01-01'),
                    currency: 'USD',
                    state: ListingState.ACTIVE,
                },
            ];

            const result = calculatePurchasePrice(mockAsset, mockNFT, listingsWithZero, 10);

            // Should not include the zero quantity listing
            expect(result.sources.every(source => source.seller !== 'seller4')).toBe(true);
        });

        it('should handle requesting more fractions than available', () => {
            const result = calculatePurchasePrice(mockAsset, mockNFT, mockListings, 300);

            const totalBought = result.sources.reduce((sum, source) => sum + source.buyAmount, 0);
            expect(totalBought).toBe(225); // All available fractions
            expect(result.finalPrice).toBe(2825);
        });
    });

    describe('price sorting', () => {
        it('should sort sellers by price (ascending)', () => {
            const shuffledListings = [mockListings[2], mockListings[0], mockListings[1]]; // 15, 12, 10
            const result = calculatePurchasePrice(mockAsset, mockNFT, shuffledListings, 120);

            expect(result.sources[0].price).toBe(10); // Cheapest first
            expect(result.sources[1].price).toBe(12); // Second cheapest
        });
    });
});
