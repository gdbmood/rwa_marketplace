import fetchNFTs from '@/utils/fetchNFTs';
import { NFT } from '@/types/NFT';
import { create } from 'zustand';

const nftStore = create<{
    nfts: Array<NFT>;
    setNfts: (newState: Array<NFT>) => void;
    fetchNfts: () => Promise<void>;
}>((set, get) => ({
    nfts: [],
    setNfts: (newState: Array<NFT>) => set({ nfts: newState }),
    fetchNfts: async () => {
        const result = await fetchNFTs();
        set({ nfts: result })
    }
}));

export default nftStore;
