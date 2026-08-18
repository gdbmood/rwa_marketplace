const getNFTS = {
    "inputs": [],
    "name": "fetchAllListings",
    "outputs": [
        {
            "components": [
                {
                    "internalType": "address",
                    "name": "nftOwner",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "nftId",
                    "type": "uint256"
                },
                {
                    "internalType": "string",
                    "name": "metadata",
                    "type": "string"
                },
                {
                    "internalType": "uint256",
                    "name": "totalSupply",
                    "type": "uint256"
                },
                {
                    "internalType": "uint256",
                    "name": "pricePerFraction",
                    "type": "uint256"
                },
                {
                    "internalType": "address",
                    "name": "erc20TokenAddress",
                    "type": "address"
                },
                {
                    "internalType": "bool",
                    "name": "isFractionalized",
                    "type": "bool"
                }
            ],
            "internalType": "struct Marketplace.NFTDetails[]",
            "name": "",
            "type": "tuple[]"
        }
    ],
    "stateMutability": "view",
    "type": "function"
} as const;

const createListing = {
    "inputs": [
        {
            "internalType": "uint256",
            "name": "totalSupply",
            "type": "uint256"
        },
        {
            "internalType": "uint256",
            "name": "pricePerFraction",
            "type": "uint256"
        },
        {
            "internalType": "string",
            "name": "metadata",
            "type": "string"
        }
    ],
    "name": "mintAndFractionalizeNFT",
    "outputs": [
        {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
        }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
} as const;

const buyNFT = {
    "inputs": [
        {
            "internalType": "uint256",
            "name": "nftId",
            "type": "uint256"
        },
        {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
        }
    ],
    "name": "buyFractions",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
} as const;

const sellNFT = {
    "inputs": [
        {
            "internalType": "uint256",
            "name": "nftId",
            "type": "uint256"
        },
        {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
        },
        {
            "internalType": "uint256",
            "name": "pricePerFraction",
            "type": "uint256"
        }
    ],
    "name": "sellFractions",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
} as const;

const unlistNFT = {
    "inputs": [
        {
            "internalType": "uint256",
            "name": "nftId",
            "type": "uint256"
        },
        {
            "internalType": "uint256",
            "name": "pricePerFraction",
            "type": "uint256"
        }
    ],
    "name": "unlistFractions",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
} as const;

const updateListing = {
    "inputs": [
        {
            "internalType": "uint256",
            "name": "nftId",
            "type": "uint256"
        },
        {
            "internalType": "uint256",
            "name": "pricePerFraction",
            "type": "uint256"
        },
        {
            "internalType": "string",
            "name": "metadata",
            "type": "string"
        }
    ],
    "name": "updateListing",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
} as const;

const fetchPlatformFee = {
    "inputs": [],
    "name": "platformFee",
    "outputs": [
        {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
        }
    ],
    "stateMutability": "view",
    "type": "function"
} as const;

export { getNFTS, createListing, updateListing, buyNFT, sellNFT, unlistNFT, fetchPlatformFee }