import { contract } from "@/lib/thirdWebClient"
import { readContract } from "thirdweb"
import { getNFTS } from "@/utils/ABI"
import { NFT } from "@/types/NFT"

const fetchNFTs = async () => {
    const nfts = (await readContract({ contract: contract, method: getNFTS })).map((nft: any) => ({
        nftOwner: nft.nftOwner,
        nftId: Number(nft.nftId),
        assetClass: nft.assetClass,
        metadata: JSON.parse(nft.metadata),
        totalSupply: Number(nft.totalSupply),
        pricePerFraction: Number(nft.pricePerFraction) / 1e6,
        erc20TokenAddress: nft.erc20TokenAddress,
        isFractionalized: nft.isFractionalized
    } as NFT))
    return nfts
}

export default fetchNFTs