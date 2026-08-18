import { Listing } from '@/types/Listing';
import { Asset } from '@/types/Asset';
import { NFT } from '@/types/NFT';

export interface Source {
    seller: string;
    price: number;
    buyAmount: number;
}

export function calculatePurchasePrice(asset: Asset, nft: NFT, listings: Listing[], numberOfFractionsToBuy: number) {
    if (!asset || !nft || numberOfFractionsToBuy <= 0) {
        return {
            sources: [],
            finalPrice: 0,
        }
    }

    let finalPrice = 0;
    let remainingFractionsToBuy = numberOfFractionsToBuy;

    const sources: { seller: string, price: number, available: number }[] = [];
    if (listings) {
        listings.forEach(listing => {
            const available = listing.quantity;
            if (available > 0) {
                sources.push({ seller: listing.listerId, price: listing.pricePerFraction, available: available });
            }
        });
    }
    sources.sort((a, b) => a.price - b.price);

    const usedSources: Source[] = [];
    for (const source of sources) {
        if (remainingFractionsToBuy <= 0) break;

        const buyAmount = Math.min(remainingFractionsToBuy, source.available);
        finalPrice += buyAmount * source.price;
        remainingFractionsToBuy -= buyAmount;

        usedSources.push({
            seller: source.seller,
            price: source.price,
            buyAmount,
        });
    }

    return {
        sources: usedSources,
        finalPrice: finalPrice,
    }
}