export type Asset = {
    _id: string,
    createdAt: string,
    txHash: string,
    initialSupply: number,
    availableSupply: number,
    assetCategory: string,
    minterId: string,
    pricePerFraction: number
}