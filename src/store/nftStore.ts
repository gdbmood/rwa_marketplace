import { create } from 'zustand';
import fetchNFTs from '@/utils/fetchNFTs';
import { NFT } from '@/types/NFT';

/**
 * On-chain NFT catalog (getNFTS read via thirdweb). No database involved;
 * kept for screens that need on-chain metadata (images, documents) that the
 * marketplace rows do not carry.
 */

interface NftState {
    nfts: Array<NFT>;
    loading: boolean;
    error: string | null;
    setNfts: (newState: Array<NFT>) => void;
    fetchNfts: () => Promise<void>;
}

const nftStore = create<NftState>((set) => ({
    nfts: [],
    loading: false,
    error: null,
    setNfts: (newState: Array<NFT>) => set({ nfts: newState }),
    fetchNfts: async () => {
        set({ loading: true, error: null });
        try {
            const result = await fetchNFTs();
            set({ nfts: result, loading: false });
        } catch (error) {
            console.error('nftStore.fetchNfts:', error);
            set({ loading: false, error: 'Could not load on-chain asset data' });
        }
    },
}));

export default nftStore;
