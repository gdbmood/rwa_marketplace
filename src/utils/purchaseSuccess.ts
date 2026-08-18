import { purchaseSuccessOnBlockchain } from "@/actions/purchase-success";
import { db, firebaseApp } from "@/lib/firebaseClient";
import { Source } from "./calculatePurchasePrice";
import { Holding } from "@/types/Holding";
import { Asset } from "@/types/Asset";
import { NFT } from "@/types/NFT";

interface PurchaseSuccessParams {
    nft: NFT;
    wallet: any;
    asset: Asset;
    sources: Source[];
    totalPrice: number;
    platformFee: number;
    transactionHash: string;
    noOfFractionsToBuy: number;
    setError: (error: string) => void;
    setSeconds: (seconds: number) => void;
    setIsPurchaseSuccess: (isSuccess: boolean) => void;
}

export default async function purchaseSuccess({ nft, wallet, asset, sources, totalPrice, platformFee, transactionHash, noOfFractionsToBuy, setError, setSeconds, setIsPurchaseSuccess }: PurchaseSuccessParams) {
    try {
        const assetCategory = await db.collection('AssetCategory').where('name', '==', nft.metadata.assetClass).get().then((querySnapshot) => {
            if (querySnapshot.docs.length > 0) {
                return querySnapshot.docs[0].id;
            }
            return null;
        });

        const existingHolding = await db.collection('RetailUser').doc(wallet.address).collection('Holding').where('assetId', '==', nft.nftId).get();
        if (existingHolding.docs.length > 0) {
            const holdingDoc = existingHolding.docs[0];
            const holdingDocData = holdingDoc.data() as Holding;
            await db.collection('RetailUser').doc(wallet.address).collection('Holding').doc(holdingDoc.id).update({
                quantity: firebaseApp.firestore.FieldValue.increment(noOfFractionsToBuy),
                averageEntryPrice: ((holdingDocData.averageEntryPrice * holdingDocData.quantity) + totalPrice) / (holdingDocData.quantity + noOfFractionsToBuy)
            });
        }
        else {
            await db.collection('RetailUser').doc(wallet.address).collection('Holding').add({
                createdAt: new Date().toISOString(),
                quantity: noOfFractionsToBuy,
                lockedQuantity: 0,
                assetId: nft.nftId,
                assetCategory,
                averageEntryPrice: totalPrice / noOfFractionsToBuy,
            })
        }
        purchaseSuccessOnBlockchain(asset._id, noOfFractionsToBuy);

        for (const source of sources) {
            db.collection('Transaction').add({
                date: new Date().toISOString(),
                txHash: transactionHash,
                quantity: source.buyAmount,
                pricePerFraction: source.price,
                currency: "USDC",
                fee: (totalPrice * (platformFee / 10000)) / sources.length,
                feeCurrency: "USDC",
                listingId: asset._id,
                assetId: nft.nftId,
                assetCategory,
                fromWallet: wallet.address,
                toWallet: source.seller,
            })
        }

        setSeconds(0);
        setIsPurchaseSuccess(true);
    } catch (error: any) {
        setError(error.message);
    }
}