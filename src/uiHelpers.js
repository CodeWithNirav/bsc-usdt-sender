// UI Helper utilities for formatting bot messages

export const emojis = {
    // Status
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    tip: '💡',
    search: '🔍',
    thinking: '💭',
    loading: '⏳',

    // Money
    wallet: '💰',
    usdt: '💵',
    bnb: '⚡',
    transaction: '💸',
    gas: '⛽',

    // Actions
    send: '📤',
    receive: '📥',
    delete: '🗑️',
    add: '➕',
    refresh: '🔄',

    // Info
    location: '📍',
    list: '📋',
    contacts: '📇',
    help: '💬',
    stats: '📊',
    target: '🎯',

    // Misc
    lock: '🔒',
    network: '🌐',
    time: '⏰'
};

export function formatBalance(walletName, address, bnb, usdt) {
    return `${emojis.wallet} **${walletName}**\n\n` +
        `Address: \`${address}\`\n` +
        `${emojis.usdt} USDT: **${usdt}**\n` +
        `${emojis.bnb} BNB: **${bnb}**`;
}

export function formatTransactionReceipt(amount, from, to, toAddress, txHash, explorerUrl) {
    return `${emojis.success} **Transaction Successful**\n\n` +
        `Amount: **${amount} USDT**\n` +
        `From: **${from}**\n` +
        `To: **${to}**\n\n` +
        `[View Transaction](${explorerUrl})`;
}

export function welcomeMessage() {
    return `👋 **Welcome to Authora**\n\n` +
        `Your BSC wallet assistant is ready.\n` +
        `Just tell me what you need in plain English.`;
}

export function formatContactNotFound(name) {
    return `${emojis.error} Contact "${name}" not found.\n\n` +
        `Add it first: "Save ${name} 0x..."`;
}
