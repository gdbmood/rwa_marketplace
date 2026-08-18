import admin from 'firebase-admin';

interface FirebaseAdminAppParams {
    projectId: string;
    clientEmail: string;
    privateKey: string;
    storageBucket: string;
}

export function createFirebaseAdminApp({
    projectId,
    clientEmail,
    privateKey,
    storageBucket,
}: FirebaseAdminAppParams) {
    const privateKeyDecoded = privateKey.replace(/\\n/g, '\n');

    if (admin.apps.length > 0) {
        return admin.app();
    }

    const app = admin.initializeApp({
        credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKeyDecoded,
        }),
        projectId,
        storageBucket,
    });

    return app;
}

export function initializeFirebaseAdminApp() {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

    if (!projectId || !clientEmail || !privateKey || !storageBucket) {
        throw new Error('Firebase Admin credentials are not set');
    }

    return createFirebaseAdminApp({
        projectId,
        clientEmail,
        privateKey,
        storageBucket,
    });
}