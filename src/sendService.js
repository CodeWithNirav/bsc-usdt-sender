import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const USDT_ABI = [
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const RPC = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/";
const USDT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955";
const LOG_FILE = process.env.LOG_FILE || path.resolve(".", "logs", "transactions.log");

// Ensure log dir exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const provider = new ethers.JsonRpcProvider(RPC);

// Cache decimals globally as it doesn't change
let cachedDecimals = null;

async function getDecimals(contract) {
    if (cachedDecimals !== null) return cachedDecimals;
    try {
        cachedDecimals = await contract.decimals();
        return cachedDecimals;
    } catch (e) {
        cachedDecimals = 18; // fallback
        return cachedDecimals;
    }
}

function appendLog(obj) {
    const line = `[${new Date().toISOString()}] ${JSON.stringify(obj)}\n`;
    fs.appendFileSync(LOG_FILE, line);
}

/**
 * Sends USDT from a specific wallet.
 * @param {Object} params
 * @param {string} params.to - Recipient address
 * @param {string|number} params.amount - Amount in USDT
 * @param {string} params.privateKey - Private key of the sender
 */
export async function sendUSDT({ to, amount, privateKey }) {
    // Validation
    if (!ethers.isAddress(to)) {
        const err = { ok: false, error: "Invalid recipient address" };
        appendLog({ action: "validate", to, amount, result: err });
        return err;
    }
    const amtStr = String(amount);
    if (isNaN(Number(amtStr)) || Number(amtStr) <= 0) {
        const err = { ok: false, error: "Invalid amount" };
        appendLog({ action: "validate", to, amount, result: err });
        return err;
    }

    if (!privateKey) {
        return { ok: false, error: "No private key provided" };
    }

    let wallet;
    try {
        wallet = new ethers.Wallet(privateKey, provider);
    } catch (e) {
        return { ok: false, error: "Invalid private key" };
    }

    const contract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, wallet);
    const sender = await wallet.getAddress();

    // decimals and parsing
    const decimals = await getDecimals(contract);
    let value;
    try {
        value = ethers.parseUnits(amtStr, decimals);
    } catch (e) {
        const err = { ok: false, error: "Amount parse error" };
        appendLog({ action: "parse", to, amount, error: e.message });
        return err;
    }

    // Balance check (USDT)
    const balance = await contract.balanceOf(sender);
    if (balance < value) {
        const err = { ok: false, error: "Insufficient USDT balance" };
        appendLog({ action: "balance_check", sender, to, amount, balance: balance.toString(), result: err });
        return err;
    }

    // Gas (BNB) check
    const nativeBalance = await provider.getBalance(sender);
    let gasEstimate;
    try {
        gasEstimate = await contract.transfer.estimateGas(to, value);
    } catch (err) {
        gasEstimate = 100000n; // 100k as BigInt
    }

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? 5000000000n; // default 5 gwei if null
    const gasCost = gasEstimate * gasPrice;

    if (nativeBalance < gasCost) {
        const err = { ok: false, error: "Insufficient BNB for gas" };
        appendLog({ action: "gas_check", sender, to, amount, nativeBalance: nativeBalance.toString(), gasEstimate: gasEstimate.toString(), gasPrice: gasPrice.toString(), gasCost: gasCost.toString(), result: err });
        return err;
    }

    // Send transaction
    try {
        const tx = await contract.transfer(to, value, {
            gasLimit: gasEstimate
        });
        appendLog({ action: "send", sender, to, amount, txHash: tx.hash });
        return { ok: true, txHash: tx.hash, explorer: `https://bscscan.com/tx/${tx.hash}` };
    } catch (err) {
        console.error("Send error:", err);
        appendLog({ action: "send_error", sender, to, amount, error: err.message });
        return { ok: false, error: err.message || "Transaction failed" };
    }
}

export async function getWalletBalance(privateKey) {
    if (!privateKey) throw new Error("Private key required for balance check");
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, wallet);

    const sender = await wallet.getAddress();
    const nativeBalance = await provider.getBalance(sender);
    const usdtBalance = await contract.balanceOf(sender);
    const decimals = await getDecimals(contract);

    return {
        address: sender,
        bnb: ethers.formatEther(nativeBalance),
        usdt: ethers.formatUnits(usdtBalance, decimals)
    };
}
