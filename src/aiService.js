import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.OPENAI_API_KEY;

let openai;

if (API_KEY) {
    openai = new OpenAI({ apiKey: API_KEY });
}

/**
 * Parses the user's natural language request into a structured transfer intent using OpenAI.
 */
export async function parseIntent(history, walletNames, contacts) {
    if (!openai) {
        console.warn("OpenAI API Key not found. AI features disabled.");
        // Fallback needs string, so take last message
        const lastMsg = Array.isArray(history) ? history[history.length - 1].content : history;
        return regexFallback(lastMsg, contacts, walletNames);
    }

    const contactNames = Object.keys(contacts).join(", ");
    const wallets = walletNames.join(", ");

    const systemPrompt = `
    You are "Authora", a crypto transaction bot. 
    Extract the intent from the user's message.
    
    Context:
    - Source Wallets: [${wallets}]
    - Contacts: [${contactNames}]
    
    Output JSON ONLY. Schema:
    {
      "actions": [
        {
          "intent": "transfer" | "check_balance" | "add_contact" | "delete_contact" | "list_contacts" | "delete_all_contacts" | "greeting" | "chat" | "unknown",
          "amount": number | null,
          "to_name": string | null, // Used for delete_contact too
          "to_address": string | null,
          "from_wallet": string | null,
          "target_wallets": string[] | null,
          "response_text": string | null 
        }
      ]
    }

    Rules:
    - Break down the user's message into one or more distinct actions.
    - Example: "Check balance of Farzi and save Samay" -> [{intent: "check_balance", ...}, {intent: "add_contact", ...}]
    - If user says "delete [name]", "remove [name]", intent is "delete_contact" and fill "to_name" with the EXACT name from the user's text.
    - CRITICAL: "delete_contact" applies even if the name is a partial match. Do not check against the contact list validity here, just extract the name.
    - If user says "delete all", intent is "delete_all_contacts".
    - If user says "Hi", "Hello", intent is "greeting".
    - If user asks general questions, intent is "chat".
      * For "chat" intent, you MUST provide a helpful response in "response_text"
      * Example: "Can you understand Hindi?" -> {intent: "chat", response_text: "I can understand commands in multiple languages including Hindi"}
    - If user asks for contacts list, intent is "list_contacts".
    - For "transfer": extract amount and recipient name.
      * If the recipient name partially matches a contact in the provided list (e.g. "Ritika" -> "Ritika Edge"), prefer the FULL name from the list.
      * If no match is found, just return the name exactly as the user said it.
    - For "check_balance": 
      * Extract wallet name from phrases like "Check [WalletName]'s balance", "balance of [WalletName]", "[WalletName] balance"
      * Match the extracted name against the available wallets list
      * If found, set "target_wallets": ["WalletName"] or "from_wallet": "WalletName"
      * Common wallet names in this system: ${wallets}
    
    CRITICAL: Use the provided message history to understand context.
    - If user says "too" or "also him" or "delete it", refer to the previous action in history.
    - Example: User "Delete Samay" -> Action Delete. User "Akshit too" -> Action Delete Akshit.
    `;

    try {
        // Construct messages array from history
        // history is [{ role: "user" | "assistant", content: "..." }]
        const messages = [
            { role: "system", content: systemPrompt },
            ...history
        ];

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            temperature: 0,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;
        const parsed = JSON.parse(content);

        // Ensure we always return an array structure, even if API stays on old format (fallback)
        let actions = parsed.actions || [parsed];

        // Post-processing for each action
        for (const action of actions) {
            if (action.intent === 'transfer' &&
                action.to_name &&
                typeof action.to_name === 'string' && // Safe check
                !action.to_address &&
                contacts[action.to_name.toLowerCase()]) {

                action.to_address = contacts[action.to_name.toLowerCase()];
            }
        }

        return { actions };

    } catch (e) {
        console.error("OpenAI Error:", e.message);
        console.warn("Falling back to Regex...");
        // Ensure we pass the latest user message text to fallbacks
        const lastUserMsg = history[history.length - 1].content;
        return regexFallback(lastUserMsg, contacts, walletNames);
    }
}

function regexFallback(msg, contacts, walletNames) {
    if (!msg || typeof msg !== 'string') {
        return { actions: [{ intent: "unknown" }] };
    }
    msg = msg.toLowerCase();

    // Greeting
    if (/^(hi|hey|hello|start|help|menu)/i.test(msg)) {
        return { actions: [{ intent: "greeting" }] };
    }

    // Transfer Regex
    const sendMatch = msg.match(/send\s+([\d.]+).*to\s+([\w]+)/i);
    if (sendMatch) {
        const amount = parseFloat(sendMatch[1]);
        const to_name = sendMatch[2];
        let to_address = contacts[to_name] || (to_name.startsWith("0x") ? to_name : null);

        // Try to find "from [wallet]"
        let from_wallet = null;
        for (const w of walletNames) {
            if (msg.includes(w.toLowerCase())) { from_wallet = w; break; }
        }

        return {
            actions: [{
                intent: "transfer",
                amount,
                to_name,
                to_address,
                from_wallet
            }]
        };
    }

    // Balance Regex
    if (msg.includes("balance") || msg.includes("check")) {
        let targetWallet = null;
        for (const w of walletNames) {
            if (msg.includes(w.toLowerCase())) { targetWallet = w; break; }
        }
        return {
            actions: [{
                intent: "check_balance",
                from_wallet: targetWallet,
                target_wallets: targetWallet ? [targetWallet] : null
            }]
        };
    }

    // Delete Regex
    // Matches: "delete [name]" or "remove [name]"
    // Be careful not to match "delete all" here if it was already handled by specific logic or if valid name
    const deleteMatch = msg.match(/(?:delete|remove)\s+(?!all\b)(.+)/i);
    if (deleteMatch) {
        const name = deleteMatch[1].replace("from contacts", "").replace("address", "").trim();
        return {
            actions: [{
                intent: "delete_contact",
                to_name: name
            }]
        };
    }

    // Delete All Regex
    if (msg.includes("delete all") || msg.includes("clear contacts")) {
        return { actions: [{ intent: "delete_all_contacts" }] };
    }

    return { actions: [{ intent: "unknown" }] };
}
