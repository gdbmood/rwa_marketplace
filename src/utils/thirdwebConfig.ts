import { generatePayload, isLoggedIn, login, logout } from "@/actions/login";
import { VerifyLoginPayloadParams } from "thirdweb/auth";
import { inAppWallet } from "thirdweb/wallets";
import { client } from '@/lib/thirdWebClient';
import { userTypes } from "@/types/Users";
import { defineChain } from 'thirdweb';

export const connectWalletConfig = (userType: userTypes = 'retail') => {
    const chainId = defineChain(parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!));
    const wallets = [
        inAppWallet({
            auth: {
                options: ["email", "passkey", "google", "apple", "facebook"]
            },
            hidePrivateKeyExport: true,
        })
    ];

    return ({
        client,
        chain: chainId,
        wallets,
        auth: {
            isLoggedIn: async (address: string) => { return await isLoggedIn(); },
            doLogin: async (params: VerifyLoginPayloadParams) => { await login(params, userType) },
            getLoginPayload: async ({ address }: { address: string }) => await generatePayload(address),
            doLogout: async () => { await logout() },
        },
        accountAbstraction: {
            chain: chainId,
            sponsorGas: true
        },
    })
}