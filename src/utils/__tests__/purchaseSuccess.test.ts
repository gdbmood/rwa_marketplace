// src/utils/__tests__/purchaseSuccess.test.ts
import purchaseSuccess from '../purchaseSuccess';
import { Asset } from '@/types/Asset';
import { NFT } from '@/types/NFT';
import { Source } from '../calculatePurchasePrice';
import { purchaseSuccessOnBlockchain } from '@/actions/purchase-success';
import { db, firebaseApp } from '@/lib/firebaseClient';

// Mock Firebase
jest.mock('@/lib/firebaseClient', () => ({
    db: {
        collection: jest.fn(),
    },
    firebaseApp: {
        firestore: {
            FieldValue: {
                increment: jest.fn((value) => `increment(${value})`),
            },
        },
    },
}));

// Mock purchase success action
jest.mock('@/actions/purchase-success', () => ({
    purchaseSuccessOnBlockchain: jest.fn(),
}));

describe('purchaseSuccess', () => {
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
            assetClass: 'real-estate',
        },
        totalSupply: 1000,
        pricePerFraction: 10,
        erc20TokenAddress: '0x123',
        isFractionalized: true,
    };

    const mockSources: Source[] = [
        {
            seller: 'seller1',
            price: 10,
            buyAmount: 50,
        },
    ];

    const mockWallet = {
        address: '0xabc123',
    };

    const mockSetError = jest.fn();
    const mockSetSeconds = jest.fn();
    const mockSetIsPurchaseSuccess = jest.fn();

    const defaultParams = {
        nft: mockNFT,
        wallet: mockWallet,
        asset: mockAsset,
        sources: mockSources,
        totalPrice: 500,
        platformFee: 25,
        transactionHash: '0xtxhash',
        noOfFractionsToBuy: 50,
        setError: mockSetError,
        setSeconds: mockSetSeconds,
        setIsPurchaseSuccess: mockSetIsPurchaseSuccess,
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Create proper Firebase mock chain
        const mockAssetCategoryGet = jest.fn().mockResolvedValue({
            docs: [{ id: 'category123' }]
        });
        const mockAssetCategoryWhere = jest.fn().mockReturnValue({
            get: mockAssetCategoryGet
        });

        const mockHoldingGet = jest.fn().mockResolvedValue({ docs: [] });
        const mockHoldingWhere = jest.fn().mockReturnValue({
            get: mockHoldingGet
        });
        const mockHoldingAdd = jest.fn().mockResolvedValue({ id: 'holding123' });
        const mockHoldingCollection = jest.fn().mockReturnValue({
            where: mockHoldingWhere,
            add: mockHoldingAdd,
        });

        const mockTransactionAdd = jest.fn().mockResolvedValue({ id: 'transaction123' });

        const mockDoc = jest.fn().mockReturnValue({
            collection: mockHoldingCollection,
        });

        // Setup db.collection mock for different collections
        jest.mocked(db).collection.mockImplementation((collectionName: string) => {
            if (collectionName === 'AssetCategory') {
                return { where: mockAssetCategoryWhere } as any;
            }
            if (collectionName === 'RetailUser') {
                return { doc: mockDoc } as any;
            }
            if (collectionName === 'Transaction') {
                return { add: mockTransactionAdd } as any;
            }
            return {} as any;
        });
    });

    describe('basic functionality', () => {
        it('should complete purchase flow successfully', async () => {
            await purchaseSuccess(defaultParams);

            expect(jest.mocked(purchaseSuccessOnBlockchain)).toHaveBeenCalledWith('asset1', 50);
            expect(mockSetIsPurchaseSuccess).toHaveBeenCalledWith(true);
            expect(mockSetSeconds).toHaveBeenCalledWith(0);
        });

        it('should call Firebase operations', async () => {
            await purchaseSuccess(defaultParams);

            expect(jest.mocked(db).collection).toHaveBeenCalledWith('AssetCategory');
            expect(jest.mocked(db).collection).toHaveBeenCalledWith('RetailUser');
            expect(jest.mocked(db).collection).toHaveBeenCalledWith('Transaction');
        });

        it('should work with different parameters', async () => {
            const customParams = {
                ...defaultParams,
                noOfFractionsToBuy: 100,
                totalPrice: 1000,
            };

            await purchaseSuccess(customParams);

            expect(jest.mocked(purchaseSuccessOnBlockchain)).toHaveBeenCalledWith('asset1', 100);
            expect(mockSetIsPurchaseSuccess).toHaveBeenCalledWith(true);
        });
    });

    describe('error handling', () => {
        it('should handle Firebase errors', async () => {
            const error = new Error('Firebase error');
            const mockErrorGet = jest.fn().mockRejectedValue(error);
            const mockErrorWhere = jest.fn().mockReturnValue({ get: mockErrorGet });

            jest.mocked(db).collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'AssetCategory') {
                    return { where: mockErrorWhere } as any;
                }
                return {} as any;
            });

            await purchaseSuccess(defaultParams);

            expect(mockSetError).toHaveBeenCalledWith('Firebase error');
            expect(mockSetIsPurchaseSuccess).not.toHaveBeenCalled();
        });
    });

    describe('parameter validation', () => {
        it('should handle zero fractions', async () => {
            const zeroParams = {
                ...defaultParams,
                noOfFractionsToBuy: 0,
            };

            await purchaseSuccess(zeroParams);

            expect(jest.mocked(purchaseSuccessOnBlockchain)).toHaveBeenCalledWith('asset1', 0);
        });

        it('should handle high fraction counts', async () => {
            const highParams = {
                ...defaultParams,
                noOfFractionsToBuy: 10000,
                totalPrice: 100000,
            };

            await purchaseSuccess(highParams);

            expect(jest.mocked(purchaseSuccessOnBlockchain)).toHaveBeenCalledWith('asset1', 10000);
        });
    });

    describe('callback functions', () => {
        it('should call setIsPurchaseSuccess on completion', async () => {
            await purchaseSuccess(defaultParams);

            expect(mockSetIsPurchaseSuccess).toHaveBeenCalledWith(true);
            expect(mockSetIsPurchaseSuccess).toHaveBeenCalledTimes(1);
            expect(mockSetSeconds).toHaveBeenCalledWith(0);
        });

        it('should call setError on error', async () => {
            const error = new Error('Test error');
            const mockErrorGet = jest.fn().mockRejectedValue(error);
            const mockErrorWhere = jest.fn().mockReturnValue({ get: mockErrorGet });

            jest.mocked(db).collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'AssetCategory') {
                    return { where: mockErrorWhere } as any;
                }
                return {} as any;
            });

            await purchaseSuccess(defaultParams);

            expect(mockSetError).toHaveBeenCalledWith('Test error');
            expect(mockSetIsPurchaseSuccess).not.toHaveBeenCalled();
        });
    });

    describe('existing holdings', () => {
        it('should update existing holding quantity', async () => {
            const mockExistingHoldingData = {
                quantity: 25,
                averageEntryPrice: 8,
            };
            const mockUpdate = jest.fn().mockResolvedValue({});
            const mockHoldingDoc = {
                id: 'existing-holding-id',
                data: jest.fn().mockReturnValue(mockExistingHoldingData),
            };
            const mockExistingHoldingGet = jest.fn().mockResolvedValue({
                docs: [mockHoldingDoc]
            });
            const mockHoldingWhere = jest.fn().mockReturnValue({
                get: mockExistingHoldingGet
            });
            const mockHoldingCollection = jest.fn().mockReturnValue({
                where: mockHoldingWhere,
                doc: jest.fn().mockReturnValue({
                    update: mockUpdate,
                }),
            });

            const mockDoc = jest.fn().mockReturnValue({
                collection: mockHoldingCollection,
            });

            jest.mocked(db).collection.mockImplementation((collectionName: string) => {
                if (collectionName === 'AssetCategory') {
                    const mockAssetCategoryGet = jest.fn().mockResolvedValue({
                        docs: [{ id: 'category123' }]
                    });
                    const mockAssetCategoryWhere = jest.fn().mockReturnValue({
                        get: mockAssetCategoryGet
                    });
                    return { where: mockAssetCategoryWhere } as any;
                }
                if (collectionName === 'RetailUser') {
                    return { doc: mockDoc } as any;
                }
                if (collectionName === 'Transaction') {
                    return { add: jest.fn() } as any;
                }
                return {} as any;
            });

            await purchaseSuccess(defaultParams);

            expect(mockUpdate).toHaveBeenCalledWith({
                quantity: 'increment(50)',
                averageEntryPrice: (8 * 25 + 500) / (25 + 50),
            });
            expect(mockSetIsPurchaseSuccess).toHaveBeenCalledWith(true);
        });
    });
});
