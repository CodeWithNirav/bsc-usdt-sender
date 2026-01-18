import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// Mapping of "Friendly Name" -> "Env Var Name"
// You should add these keys to your .env file:
// WALLET_MAIN_OPS=...
// WALLET_RESERVE=...
const WALLET_ENV_MAP = {
    "Main Ops": "WALLET_MAIN_OPS",
    "Reserve": "WALLET_RESERVE",
    "Ritika": "WALLET_RITIKA",
    "Farzi": "WALLET_FARZI",
    "Princess": "WALLET_PRINCESS",
    // Fallback for backward compatibility or default
    "Default": "PRIVATE_KEY"
};

export function getWalletPrivateKey(friendlyName) {
    const envVar = WALLET_ENV_MAP[friendlyName] || WALLET_ENV_MAP["Default"];
    const key = process.env[envVar];

    if (!key) {
        throw new Error(`Wallet '${friendlyName}' not found or key not set in environment variables (checked ${envVar}).`);
    }
    return key;
}

export function getAllWalletNames() {
    return Object.keys(WALLET_ENV_MAP).filter(name => {
        const envVar = WALLET_ENV_MAP[name];
        // Ensure we check the current process.env
        return !!process.env[envVar];
    });
}

export function getAddressFromKey(privateKey) {
    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
}
