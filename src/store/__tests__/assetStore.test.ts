// src/store/__tests__/assetStore.test.ts
import { act } from '@testing-library/react';
import assetStore from '../assetStore';
import { Asset } from '@/types/Asset';
import { db } from '@/lib/firebaseClient';
import nftStore from '../nftStore';

// Mock Firebase
jest.mock('@/lib/firebaseClient', () => ({
    db: {
        collection: jest.fn(() => ({
            get: jest.fn(),
        })),
    },
}));

// Mock nftStore
jest.mock('../nftStore', () => ({
    __esModule: true,
    default: {
        getState: jest.fn(() => ({
            nfts: [],
            setNfts: jest.fn(),
            fetchNfts: jest.fn(),
        })),
    },
}));

describe('assetStore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset store state
        assetStore.getState().setAssets([]);
    });

    describe('initial state', () => {
        it('should have empty assets array initially', () => {
            const { assets } = assetStore.getState();
            expect(assets).toEqual([]);
        });
    });

    describe('setAssets', () => {
        it('should update assets state', () => {
            const mockAssets: Asset[] = [
                {
                    _id: 'asset1',
                    createdAt: '2024-01-01',
                    txHash: '0x123',
                    initialSupply: 1000,
                    availableSupply: 800,
                    assetCategory: 'real-estate',
                    minterId: 'minter1',
                    pricePerFraction: 10,
                },
            ];

            act(() => {
                assetStore.getState().setAssets(mockAssets);
            });

            const { assets } = assetStore.getState();
            expect(assets).toEqual(mockAssets);
        });

        it('should replace existing assets', () => {
            const initialAssets: Asset[] = [
                {
                    _id: 'asset1',
                    createdAt: '2024-01-01',
                    txHash: '0x123',
                    initialSupply: 1000,
                    availableSupply: 800,
                    assetCategory: 'real-estate',
                    minterId: 'minter1',
                    pricePerFraction: 10,
                },
            ];

            const newAssets: Asset[] = [
                {
                    _id: 'asset2',
                    createdAt: '2024-01-02',
                    txHash: '0x456',
                    initialSupply: 2000,
                    availableSupply: 1500,
                    assetCategory: 'stocks',
                    minterId: 'minter2',
                    pricePerFraction: 15,
                },
            ];

            act(() => {
                assetStore.getState().setAssets(initialAssets);
            });

            act(() => {
                assetStore.getState().setAssets(newAssets);
            });

            const { assets } = assetStore.getState();
            expect(assets).toEqual(newAssets);
            expect(assets).not.toContain(initialAssets[0]);
        });
    });

    describe('fetchAssets', () => {
        it('should fetch and sort assets by creation date', async () => {
            const mockAssetData = [
                {
                    id: 'asset1',
                    data: () => ({
                        createdAt: '2024-01-01',
                        txHash: '0x123',
                        initialSupply: 1000,
                        availableSupply: 800,
                        assetCategory: 'real-estate',
                        minterId: 'minter1',
                        pricePerFraction: 10,
                    }),
                },
                {
                    id: 'asset2',
                    data: () => ({
                        createdAt: '2024-01-02',
                        txHash: '0x456',
                        initialSupply: 2000,
                        availableSupply: 1500,
                        assetCategory: 'stocks',
                        minterId: 'minter2',
                        pricePerFraction: 15,
                    }),
                },
            ];

            const mockQuerySnapshot = {
                forEach: jest.fn((callback) => {
                    mockAssetData.forEach(callback);
                }),
            };

            jest.mocked(db).collection.mockReturnValue({
                get: jest.fn().mockResolvedValue(mockQuerySnapshot),
            } as any);

            const result = await act(async () => {
                return assetStore.getState().fetchAssets();
            });

            expect(jest.mocked(db).collection).toHaveBeenCalledWith('Asset');
            expect(result).toHaveLength(2);

            // Should be sorted by creation date (newest first)
            expect(result[0]._id).toBe('asset2');
            expect(result[1]._id).toBe('asset1');

            const { assets } = assetStore.getState();
            expect(assets).toEqual(result);
        });

        it('should handle empty firestore collection', async () => {
            const mockQuerySnapshot = {
                forEach: jest.fn(),
            };

            jest.mocked(db).collection.mockReturnValue({
                get: jest.fn().mockResolvedValue(mockQuerySnapshot),
            } as any);

            const result = await act(async () => {
                return assetStore.getState().fetchAssets();
            });

            expect(result).toEqual([]);

            const { assets } = assetStore.getState();
            expect(assets).toEqual([]);
        });

        it('should call nftStore.fetchNfts if nfts array is empty', async () => {
            const mockFetchNfts = jest.fn();
            jest.mocked(nftStore).getState.mockReturnValue({
                nfts: [],
                setNfts: jest.fn(),
                fetchNfts: mockFetchNfts,
            });

            const mockQuerySnapshot = {
                forEach: jest.fn(),
            };

            jest.mocked(db).collection.mockReturnValue({
                get: jest.fn().mockResolvedValue(mockQuerySnapshot),
            } as any);

            await act(async () => {
                await assetStore.getState().fetchAssets();
            });

            expect(mockFetchNfts).toHaveBeenCalled();
        });

        it('should not call nftStore.fetchNfts if nfts array is not empty', async () => {
            const mockFetchNfts = jest.fn();

            jest.mocked(nftStore).getState.mockReturnValue({
                nfts: ['mock-nft'] as any, // Non-empty array
                setNfts: jest.fn(),
                fetchNfts: mockFetchNfts,
            });

            const mockQuerySnapshot = {
                forEach: jest.fn(),
            };

            jest.mocked(db).collection.mockReturnValue({
                get: jest.fn().mockResolvedValue(mockQuerySnapshot),
            } as any);

            await act(async () => {
                await assetStore.getState().fetchAssets();
            });

            expect(mockFetchNfts).not.toHaveBeenCalled();
        });

        it('should handle firestore errors gracefully', async () => {
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            jest.mocked(db).collection.mockReturnValue({
                get: jest.fn().mockRejectedValue(new Error('Firestore error')),
            } as any);

            await expect(
                act(async () => {
                    await assetStore.getState().fetchAssets();
                })
            ).rejects.toThrow('Firestore error');

            consoleErrorSpy.mockRestore();
        });
    });
});
