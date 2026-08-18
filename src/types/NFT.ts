export type NFT = {
    nftOwner: string,
    nftId: number,
    metadata: {
        nftName: string,
        imageUrls: readonly string[],
        documentUrls: { [key: string]: string[] },
        description: string,
        [key: string]: any
    },
    totalSupply: number,
    pricePerFraction: number,
    erc20TokenAddress: string,
    isFractionalized: boolean
}