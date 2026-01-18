import { Telegraf, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { parseIntent } from "./aiService.js";
import { sendUSDT, getWalletBalance } from "./sendService.js";
import { getWalletPrivateKey, getAllWalletNames } from "./walletManager.js";
import { getContacts, addContact, getContactAddress, clearContacts, deleteContact, findContactCandidates } from "./contactManager.js";
import { emojis, welcomeMessage, formatBalance, formatTransactionReceipt, formatContactNotFound } from "./uiHelpers.js";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = Number(process.env.TELEGRAM_USER_ID);

if (!BOT_TOKEN) {
    console.error("BOT_TOKEN is missing in .env");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Simple in-memory session for the single user (Command Center style)
let pendingTx = null;
let chatHistory = []; // Stores { role: "user" | "assistant", content: string }

// Middleware: Security Request
bot.use(async (ctx, next) => {
    if (ctx.from?.id !== OWNER_ID) {
        console.log(`Unauthorized access attempt from: ${ctx.from?.id} (${ctx.from?.username})`);
        return; // Silent ignore
    }
    await next();
});

bot.command("start", (ctx) => {
    ctx.reply(welcomeMessage(), {
        parse_mode: "Markdown",
        reply_markup: { remove_keyboard: true }
    });
});

bot.command("help", (ctx) => {
    ctx.reply(
        `**Available Commands:**\n\n` +
        `Natural language: "Send 10 USDT to Bob"\n` +
        `/balance [Wallet] - Check balance\n` +
        `/contacts - List contacts\n` +
        `/add_contact [Name] [0x...] - Manual add`,
        { parse_mode: "Markdown" }
    );
});

bot.command("contacts", (ctx) => {
    const contacts = getContacts();
    const count = Object.keys(contacts).length;

    let msg = `**Saved Contacts** (${count})\n\n`;

    if (count === 0) {
        msg += `No contacts saved yet.`;
    } else {
        for (const [name, addr] of Object.entries(contacts)) {
            msg += `**${name}**\n\`${addr}\`\n\n`;
        }
    }

    ctx.replyWithMarkdown(msg);
});

bot.command("add_contact", (ctx) => {
    const parts = ctx.message.text.split(" ");
    if (parts.length !== 3) {
        return ctx.reply(`${emojis.error} Usage: /add_contact [Name] [0xAddress]`);
    }
    const name = parts[1];
    const address = parts[2];
    addContact(name, address);
    ctx.reply(`${emojis.success} Contact **${name}** saved.`, { parse_mode: "Markdown" });
});

bot.command("balance", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    let walletName = parts.slice(1).join(" ");

    const allWallets = getAllWalletNames();

    if (!walletName && allWallets.length > 0) {
        walletName = allWallets[0];
    }

    try {
        const key = getWalletPrivateKey(walletName);
        const bal = await getWalletBalance(key);
        const formatted = formatBalance(walletName, bal.address, bal.bnb, bal.usdt);

        ctx.reply(formatted, { parse_mode: "Markdown" });
    } catch (e) {
        ctx.reply(`${emojis.error} Error: ${e.message}`);
    }
});

// AI Handler
bot.on(message("text"), async (ctx) => {
    const userText = ctx.message.text;

    // Context-aware loading message
    let loadingEmoji = emojis.thinking;
    if (userText.toLowerCase().includes('balance') || userText.toLowerCase().includes('check')) {
        loadingEmoji = `${emojis.wallet}`;
    } else if (userText.toLowerCase().includes('send') || userText.toLowerCase().includes('transfer')) {
        loadingEmoji = `${emojis.send}`;
    } else if (userText.toLowerCase().includes('delete') || userText.toLowerCase().includes('remove')) {
        loadingEmoji = `${emojis.search}`;
    }

    const waitingMsg = await ctx.reply(`${loadingEmoji} ${emojis.thinking} Processing...`);

    try {
        const walletNames = getAllWalletNames();
        const contacts = getContacts();

        // Update History (Limit to last 10 turns)
        chatHistory.push({ role: "user", content: userText });
        if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

        // 2. Parse (returns { actions: [...] })
        const result = await parseIntent(chatHistory, walletNames, contacts);
        console.log("DEBUG Intent Result:", JSON.stringify(result, null, 2));

        // delete waiting message
        await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id);

        // Fallback for unexpected format (though aiService should handle it)
        const actions = result.actions || [result];

        // 3. Loop through actions
        for (const intent of actions) {

            // Track what the assistant says for context
            let assistantResponse = "";

            if (intent.intent === "unknown" || intent.intent === "error") {
                assistantResponse = "I couldn't understand that part of the command.";
                await ctx.reply(
                    `${emojis.error} ${assistantResponse}\n\nTry:\n• "Send 10 to Farzi"\n• "Check balance"\n• "List contacts"`
                );
                continue;
            }

            if (intent.intent === "transfer") {
                const { amount, to_name, to_address, from_wallet } = intent;

                if (!amount || (!to_address && !to_name)) {
                    console.log(`DEBUG: Transfer Validation Failed. Amount: ${amount}, Name: ${to_name}, Address: ${to_address}`);
                    assistantResponse = "Missing transfer details";
                    await ctx.reply(
                        `${emojis.error} **Missing Details**\n\n` +
                        `I need: Amount and Recipient\n\n` +
                        `${emojis.tip} Example: "Send 10 to Farzi"`,
                        { parse_mode: "Markdown" }
                    );
                    continue;
                }

                let recipientAddr = to_address;
                let resolvedName = to_name;

                // Smart contact resolution if no address provided
                if (!recipientAddr && to_name) {
                    const result = findContactCandidates(to_name);

                    if (result.status === "exact") {
                        recipientAddr = getContactAddress(result.match);
                        resolvedName = result.match;
                    } else if (result.status === "ambiguous") {
                        const list = result.candidates.map(c => `• ${c}`).join("\n");
                        assistantResponse = `Asked for clarification on transfer recipient`;
                        await ctx.reply(
                            `🤔 **Multiple contacts found:**\n\n${list}\n\n` +
                            `${emojis.tip} Please say:\n"Send ${amount} to [Specific Name]"`,
                            { parse_mode: "Markdown" }
                        );
                        continue;
                    } else {
                        // Not found
                        assistantResponse = `Unknown recipient ${to_name}`;
                        const suggestions = Object.keys(contacts)
                            .filter(c => c.toLowerCase().includes(to_name.toLowerCase().substring(0, 3)))
                            .slice(0, 3);
                        await ctx.reply(
                            formatContactNotFound(to_name, suggestions),
                            { parse_mode: "Markdown" }
                        );
                        continue;
                    }
                }

                if (!recipientAddr) {
                    assistantResponse = `Unknown recipient ${to_name}`;
                    await ctx.reply(
                        formatContactNotFound(to_name),
                        { parse_mode: "Markdown" }
                    );
                    continue;
                }

                let sourceWallet = from_wallet;
                if (!sourceWallet && walletNames.length > 0) sourceWallet = walletNames[0];

                // Store pending
                pendingTx = {
                    to: recipientAddr,
                    amount: amount,
                    from: sourceWallet,
                    formattedName: resolvedName || recipientAddr
                };

                assistantResponse = `Requesting confirmation for ${amount} USDT transfer`;

                // Professional confirmation dialog
                const confirmMsg =
                    `╔═══════════════════════════╗\n` +
                    `║  ${emojis.warning}  CONFIRM TRANSACTION   ║\n` +
                    `╠═══════════════════════════╣\n` +
                    `║                           ║\n` +
                    `║  ${emojis.transaction} Amount: ${amount} USDT\n` +
                    `║  ${emojis.send} From: ${sourceWallet}\n` +
                    `║  ${emojis.receive} To: ${pendingTx.formattedName}\n` +
                    `║  ${emojis.location} ${recipientAddr.substring(0, 10)}...${recipientAddr.substring(recipientAddr.length - 4)}\n` +
                    `║                           ║\n` +
                    `║  ${emojis.gas} Est. Gas: ~0.0003 BNB  ║\n` +
                    `║                           ║\n` +
                    `╚═══════════════════════════╝\n\n` +
                    `Contact saved!`;

                await ctx.reply(confirmMsg, {
                    parse_mode: "Markdown",
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback(`${emojis.success} APPROVE`, "confirm_tx")],
                        [Markup.button.callback(`${emojis.error} CANCEL`, "cancel_tx")]
                    ])
                });
            }

            if (intent.intent === "greeting") {
                assistantResponse = "Sent greeting";
                await ctx.reply(welcomeMessage(), {
                    parse_mode: "Markdown"
                });
            }

            if (intent.intent === "check_balance") {
                let walletsToCheck = [];
                if (intent.target_wallets && intent.target_wallets.length > 0) {
                    walletsToCheck = intent.target_wallets;
                } else if (intent.from_wallet) {
                    walletsToCheck = [intent.from_wallet];
                } else {
                    walletsToCheck = [getAllWalletNames()[0]];
                }

                for (const walletName of walletsToCheck) {
                    try {
                        const key = getWalletPrivateKey(walletName);
                        const bal = await getWalletBalance(key);
                        assistantResponse = `Checked balance for ${walletName}`;

                        const formatted = formatBalance(walletName, bal.address, bal.bnb, bal.usdt);
                        await ctx.reply(formatted, {
                            parse_mode: "Markdown",
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback(`${emojis.send} Send from ${walletName}`, `send_${walletName}`)]
                            ])
                        });
                    } catch (e) {
                        assistantResponse = `Error checking ${walletName}`;
                        await ctx.reply(
                            `${emojis.error} **Error checking ${walletName}**\n\n${e.message}`,
                            { parse_mode: "Markdown" }
                        );
                    }
                }
            }

            if (intent.intent === "add_contact") {
                const name = intent.to_name;
                const address = intent.to_address;
                if (name && address) {
                    addContact(name, address);
                    assistantResponse = `Saved contact ${name}`;
                    await ctx.reply(`${emojis.success} Contact **${name}** saved.`, { parse_mode: "Markdown" });
                } else {
                    assistantResponse = "Missing contact details";
                    await ctx.reply(
                        `${emojis.error} **Missing Details**\n\nI need both name and address.`,
                        { parse_mode: "Markdown" }
                    );
                }
            }

            if (intent.intent === "list_contacts") {
                const contacts = getContacts();
                const count = Object.keys(contacts).length;
                let msg = `${emojis.contacts} **Saved Contacts** (${count})\n\n`;

                if (count === 0) {
                    msg += `${emojis.info} No contacts saved yet.\n\n${emojis.tip} Add one with: "Save [Name] [Address]"`;
                } else {
                    for (const [name, addr] of Object.entries(contacts)) {
                        msg += `${emojis.location} **${name}**\n   \`${addr}\`\n\n`;
                    }
                }

                assistantResponse = "Listed all contacts";
                await ctx.replyWithMarkdown(msg);
            }

            if (intent.intent === "delete_all_contacts") {
                clearContacts();
                assistantResponse = "Cleared all contacts";
                await ctx.reply(
                    `${emojis.success} **Address Book Cleared**\n\n` + `Contact saved!`,
                    { parse_mode: "Markdown" }
                );
            }

            if (intent.intent === "delete_contact") {
                if (intent.to_name) {
                    const result = findContactCandidates(intent.to_name);

                    if (result.status === "exact") {
                        const success = deleteContact(result.match);
                        if (success) {
                            assistantResponse = `Deleted contact ${result.match}`;
                            await ctx.reply(
                                `${emojis.success} **Deleted:** ${result.match}\n\n` + `Contact saved!`,
                                { parse_mode: "Markdown" }
                            );
                        } else {
                            assistantResponse = "Delete failed";
                            await ctx.reply(
                                `${emojis.error} Error deleting contact.`,
                                {}
                            );
                        }
                    } else if (result.status === "ambiguous") {
                        const list = result.candidates.map(c => `• ${c}`).join("\n");
                        assistantResponse = `Asked for clarification on ${intent.to_name}`;
                        await ctx.reply(
                            `🤔 **Multiple contacts found:**\n\n${list}\n\n` +
                            `${emojis.tip} Please say: "Delete [Specific Name]"`,
                            { parse_mode: "Markdown" }
                        );
                    } else {
                        assistantResponse = `Contact ${intent.to_name} not found`;
                        await ctx.reply(
                            `${emojis.error} Contact **${intent.to_name}** not found.`,
                            { parse_mode: "Markdown" }
                        );
                    }
                } else {
                    assistantResponse = "Missing delete target";
                    await ctx.reply(
                        `${emojis.error} I don't know who to delete.`
                    );
                }
            }

            if (intent.intent === "chat" && intent.response_text) {
                assistantResponse = intent.response_text;
                await ctx.reply(
                    `${emojis.info} ${intent.response_text}`,
                    { parse_mode: "Markdown" }
                );
            }

            // Add assistant response to history
            if (assistantResponse) {
                chatHistory.push({ role: "assistant", content: assistantResponse });
                if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);
            }
        } // end loop

    } catch (e) {
        console.error("Bot Error Stack:", e);
        ctx.reply("System Error: " + e.message);
    }
});

// Action Handlers
bot.action("confirm_tx", async (ctx) => {
    if (!pendingTx) {
        return ctx.answerCbQuery("Transaction expired");
    }

    const { to, amount, from, formattedName } = pendingTx;
    pendingTx = null; // Clear immediately

    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `${emojis.loading} **Initiating transaction...**\n\nPlease wait...`,
        { parse_mode: "Markdown" }
    );

    try {
        const key = getWalletPrivateKey(from);
        const result = await sendUSDT({ to, amount, privateKey: key });

        if (result.ok) {
            const receipt = formatTransactionReceipt(
                amount,
                from,
                formattedName || "Recipient",
                to,
                result.txHash,
                result.explorer
            );

            await ctx.editMessageText(receipt, {
                parse_mode: "Markdown",
                link_preview_options: { is_disabled: true },
                disable_web_page_preview: true
            });
        } else {
            await ctx.editMessageText(
                `${emojis.error} **Transaction Failed**\n\n` +
                `Reason: ${result.error}\n\n` +
                `Try again or check your balance.`,
                { parse_mode: "Markdown" }
            );
        }
    } catch (e) {
        await ctx.editMessageText(
            `${emojis.error} **Critical Error**\n\n${e.message}`,
            { parse_mode: "Markdown" }
        );
    }
});

bot.action("cancel_tx", async (ctx) => {
    pendingTx = null;
    await ctx.answerCbQuery("Transaction cancelled");
    await ctx.editMessageText(
        `${emojis.error} **Operation Cancelled**\n\nTransaction was aborted by user.`,
        { parse_mode: "Markdown" }
    );
});

// Inline button callbacks (help actions)
bot.action("help_add_contact", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        `${emojis.add} **Add Contact**\n\n` +
        `${emojis.tip} Simply say:\n"Save [Name] [0xAddress]"\n\n` +
        `Example: "Save Farzi 0xD199..."`,
        { parse_mode: "Markdown" }
    );
});

bot.action("help_delete_contact", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        `${emojis.delete} **Delete Contact**\n\n` +
        `${emojis.tip} Simply say:\n"Delete [Name]"\n\n` +
        `Example: "Delete Farzi"`,
        { parse_mode: "Markdown" }
    );
});

bot.action("refresh_balance", async (ctx) => {
    await ctx.answerCbQuery("Refreshing...");
    ctx.reply(
        `${emojis.tip} Say: "Check balance" or specify a wallet!`,
        {}
    );
});

// Send from wallet (inline button)
bot.action(/^send_.+/, async (ctx) => {
    const walletName = ctx.match[0].replace('send_', '');
    await ctx.answerCbQuery();
    ctx.reply(
        `${emojis.send} **Send from ${walletName}**\n\n` +
        `${emojis.tip} Say:\n"Send [amount] to [name] from ${walletName}"`,
        { parse_mode: "Markdown" }
    );
});

// Start bot
bot.launch(async () => {
    console.log("🤖 Authora Bot Online");
    console.log("\n📊 Loaded Wallets:");
    const names = getAllWalletNames();
    for (const name of names) {
        try {
            const key = getWalletPrivateKey(name);
            const wallet = new ethers.Wallet(key);
            console.log(`   - ${name}: ${wallet.address}`);
        } catch (e) {
            console.log(`   - ${name}: [Error loading key]`);
        }
    }
    console.log("\nWaiting for commands...");
});

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));



