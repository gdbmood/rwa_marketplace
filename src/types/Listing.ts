export enum ListingState {
    ACTIVE = 'ACTIVE',
    CANCELED = 'CANCELED'
}

export type Listing = {
    _id: string,
    createdAt: Date,
    quantity: number,
    pricePerFraction: number,
    currency: string,
    state: ListingState,
    assetId: string,
    listerId: string
}