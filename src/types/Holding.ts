export type Holding = {
    _id: string,
    createdAt: string,
    quantity: number,
    lockedQuantity: number,
    assetId: string,
    assetCategory: string,
    averageEntryPrice: number,
}