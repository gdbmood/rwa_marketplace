import { createThirdwebClient, defineChain, getContract } from "thirdweb";

const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!; // this will be used on the client
const secretKey = process.env.THIRDWEB_SECRET_KEY!; // this will be used on the server-side

export const client = createThirdwebClient(
    secretKey ? { secretKey } : { clientId },
);

export const contract = getContract({
    client,
    chain: defineChain(parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!)),
    address: process.env.NEXT_PUBLIC_THIRDWEB_CONTRACT_ADDRESS!,
});

export const getContractByAddress = (address: string) => getContract({
    client,
    chain: defineChain(parseInt(process.env.NEXT_PUBLIC_THIRDWEB_CHAIN_ID!)),
    address,
});