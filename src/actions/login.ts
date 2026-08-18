"use server";

import { VerifyLoginPayloadParams, createAuth } from "thirdweb/auth";
import { initializeFirebaseAdminApp } from '@/lib/firebaseServer'
import { getFirestore } from "firebase-admin/firestore";
import { privateKeyToAccount } from "thirdweb/wallets";
import { client } from "@/lib/thirdWebClient";
import { userTypes } from "@/types/Users";
import { cookies } from "next/headers";

initializeFirebaseAdminApp()
const privateKey = process.env.AUTH_PRIVATE_KEY || "";

if (!privateKey) {
    throw new Error("Missing AUTH_PRIVATE_KEY in .env file.");
}

const thirdwebAuth = createAuth({
    domain: process.env.NEXT_PUBLIC_THIRDWEB_AUTH_DOMAIN || "",
    adminAccount: privateKeyToAccount({ client, privateKey }),
    client: client,
});

export async function generatePayload(address: string) {
    return thirdwebAuth.generatePayload({
        chainId: parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!),
        address
    });
}

export async function login(payload: VerifyLoginPayloadParams, userType: userTypes = 'retail') {
    const verifiedPayload = await thirdwebAuth.verifyPayload(payload);
    if (verifiedPayload.valid) {
        const tableName = userType === 'retail' ? "RetailUser" : "BusinessUser";

        const db = getFirestore();
        const userRef = db.collection(tableName).doc(verifiedPayload.payload.address);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            const payload: { isVerified?: boolean; createdAt: Date; } = { createdAt: new Date() }
            if (userType !== 'retail') {
                payload.isVerified = false;
            }
            await userRef.set(payload);
        }

        const cookieStore = await cookies()
        const jwt = await thirdwebAuth.generateJWT({
            payload: verifiedPayload.payload,
            context: {
                walletAddress: verifiedPayload.payload.address
            }
        });
        cookieStore.set("jwt", jwt);
    }
}

export async function isLoggedIn() {
    const cookieStore = await cookies()
    const jwt = cookieStore.get("jwt");
    if (!jwt?.value) {
        return false;
    }

    const authResult = await thirdwebAuth.verifyJWT({ jwt: jwt.value });
    return authResult.valid;
}

export async function logout() {
    const cookieStore = await cookies()
    cookieStore.delete("jwt");
}
