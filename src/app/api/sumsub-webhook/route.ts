import { initializeFirebaseAdminApp } from '@/lib/firebaseServer'
import { getFirestore } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        initializeFirebaseAdminApp()
        const data = await req.json()
        console.log('Received webhook data:', data)

        if (data.reviewResult.reviewAnswer === 'GREEN') {
            const tableName = data.levelName === 'id-only' ? 'RetailUser' : 'BusinessUser'
            const db = getFirestore()
            if (tableName === 'BusinessUser') {
                await db.collection(tableName).doc(data.externalUserId).update({
                    isVerified: true
                })
            }
            else {
                await db.collection(tableName).doc(data.externalUserId).collection('KYCIdentity').add({
                    sumsubVerified: true,
                })
            }
        }

        return Response.json({ status: 'ok' })
    } catch (error) {
        console.error('Error processing webhook:', error)
        return Response.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 })
    }
}