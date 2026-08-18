"use server";

import { initializeFirebaseAdminApp } from '@/lib/firebaseServer'
import { getFirestore } from 'firebase-admin/firestore';
import { Holding } from '@/types/Holding';
import { Listing } from '@/types/Listing';
import { Asset } from '@/types/Asset';

export async function purchaseSuccessOnBlockchain(assetId: string, quantity: number) {
    initializeFirebaseAdminApp()

    const assetRef = getFirestore().collection('Asset').doc(assetId);
    const assetDoc = await assetRef.get();
    if (assetDoc.exists) {
        const listingsRef = assetRef.collection('Listing');
        let listings = await listingsRef.get();
        let listingsData = listings.docs.map(listing => {
            return {
                _id: listing.id,
                ...listing.data()
            } as Listing
        });
        listingsData.sort((a, b) => a.pricePerFraction - b.pricePerFraction);

        let remainingFractionsToBuy = quantity;
        for (const source of listingsData) {
            if (remainingFractionsToBuy <= 0) {
                break
            };

            const canBuy = Math.min(remainingFractionsToBuy, source.quantity);
            if (canBuy > 0) {
                if (source.quantity - canBuy <= 0) {
                    await listingsRef.doc(source._id).delete();
                } else {
                    await listingsRef.doc(source._id).update({ quantity: source.quantity - canBuy });
                }

                const holdingDocs = await getFirestore().collection('RetailUser').doc(source.listerId).collection('Holding').where('assetId', '==', parseInt(assetId)).get();
                if (!holdingDocs.empty) {
                    const holdingRef = holdingDocs.docs[0].ref;
                    const holdingData = holdingDocs.docs[0].data() as Holding;
                    await holdingRef.update({
                        quantity: holdingData.quantity - canBuy,
                        lockedQuantity: holdingData.lockedQuantity - canBuy,
                    });
                }
                remainingFractionsToBuy -= canBuy;
            }
        }

        const assetData = { _id: assetDoc.id, ...assetDoc.data() } as Asset;
        listings = await listingsRef.get();
        listingsData = listings.docs.map(listing => {
            return {
                _id: listing.id,
                ...listing.data()
            } as Listing
        });
        listingsData.sort((a, b) => a.pricePerFraction - b.pricePerFraction);
        await assetRef.update({
            availableSupply: assetData.availableSupply - quantity,
            pricePerFraction: listingsData.length > 0 ? listingsData[0].pricePerFraction : 0
        });
    }
}