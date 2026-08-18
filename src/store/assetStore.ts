import { db } from '@/lib/firebaseClient';
import nftStore from "@/store/nftStore";
import { Asset } from '@/types/Asset';
import { create } from 'zustand';

const assetStore = create<
    {
        assets: Array<Asset>;
        setAssets: (newState: Array<Asset>) => void;
        fetchAssets: () => Promise<Array<Asset>>;
    }
>((set, get) => ({
    assets: [],
    setAssets: (newState: Array<Asset>) => set({ assets: newState }),
    fetchAssets: async () => {
        const [_, assets] = await Promise.all([
            (async () => {
                const { nfts, fetchNfts } = nftStore.getState();
                if (nfts.length === 0) {
                    await fetchNfts();
                }
            })(),
            (async () => {
                const assets: Array<Asset> = [];
                const querySnapshot = await db.collection('Asset').get();
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    assets.push({
                        _id: doc.id,
                        createdAt: data.createdAt,
                        txHash: data.txHash,
                        initialSupply: data.initialSupply,
                        availableSupply: data.availableSupply,
                        assetCategory: data.assetCategory,
                        minterId: data.minterId,
                        ...data
                    } as Asset)
                });
                const sortedAssets = assets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                set({ assets: sortedAssets });
                return sortedAssets;
            })()
        ]);
        return assets;
    }
}));

export default assetStore;
