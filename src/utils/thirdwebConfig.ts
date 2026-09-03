import { generatePayload, isLoggedIn, login, logout } from "@/actions/login";
import { VerifyLoginPayloadParams } from "thirdweb/auth";
import { inAppWallet } from "thirdweb/wallets";
import { chain, client } from '@/lib/thirdWebClient';
import { userTypes } from "@/types/Users";
import sessionStore from "@/store/sessionStore";

/**
 * Shared thirdweb connect configuration (used by the navbar ConnectButton and
 * every page that auto-opens the connect modal). The auth handlers consume
 * the ActionResult contract of the login action: a failed login throws with
 * the server message so the modal surfaces it, and a successful login
 * refreshes the client session state. Pass the role of the current host so a
 * business user connecting through the shared navbar is registered as
 * business (see docs/audit/frontend.md section 3.3).
 */
export const connectWalletConfig = (userType: userTypes = 'retail') => {
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
        chain,
        wallets,
        auth: {
            isLoggedIn: async (address: string) => { return await isLoggedIn(address); },
            doLogin: async (params: VerifyLoginPayloadParams) => {
                const result = await login(params, userType);
                if (!result.ok) {
                    throw new Error(result.error.message);
                }
                await sessionStore.getState().refresh();
            },
            getLoginPayload: async ({ address }: { address: string }) => await generatePayload(address),
            doLogout: async () => {
                await logout();
                sessionStore.getState().clear();
            },
        },
        accountAbstraction: {
            chain,
            sponsorGas: true
        },
    })
}
