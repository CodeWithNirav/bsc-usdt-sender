import fs from "fs";
import path from "path";

const CONTACTS_FILE = path.resolve("contacts.json");

function loadContacts() {
    if (!fs.existsSync(CONTACTS_FILE)) {
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(CONTACTS_FILE, "utf-8"));
}

function saveContacts(contacts) {
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
}

export function clearContacts() {
    try {
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify({}, null, 2));
        return true;
    } catch (e) {
        console.error("Error clearing contacts:", e);
        return false;
    }
}

export function getContacts() {
    return loadContacts();
}

export function addContact(name, address) {
    if (!name || typeof name !== 'string') return;
    const contacts = loadContacts();

    // Check if contact already exists (case-insensitive)
    const normalized = name.toLowerCase();
    const existingKey = Object.keys(contacts).find(k => k.toLowerCase() === normalized);

    // Remove old entry if exists with different capitalization
    if (existingKey && existingKey !== name) {
        delete contacts[existingKey];
    }

    // Store with original capitalization
    contacts[name] = address;
    saveContacts(contacts);
}

// Returns { status: "exact"|"ambiguous"|"none", match: string, candidates: string[] }
export function findContactCandidates(name) {
    if (!name || typeof name !== 'string') return { status: "none" };
    const contacts = loadContacts();
    const normalized = name.toLowerCase().trim();

    // 1. Exact Match (case-insensitive)
    const exactKey = Object.keys(contacts).find(k => k.toLowerCase() === normalized);
    if (exactKey) {
        return { status: "exact", match: exactKey };
    }

    // 2. Fuzzy Match (case-insensitive contains)
    const candidates = Object.keys(contacts).filter(k => k.toLowerCase().includes(normalized));

    if (candidates.length === 1) {
        return { status: "exact", match: candidates[0] };
    }

    if (candidates.length > 1) {
        return { status: "ambiguous", candidates };
    }

    return { status: "none" };
}

export function deleteContact(name) {
    // This function is now just a wrapper for backward compatibility or simple deletes
    // For smart deletes, bot.js should use findContactCandidates first.
    // But we'll keep it functional for direct calls.
    const result = findContactCandidates(name);
    if (result.status === "exact") {
        const contacts = loadContacts();
        delete contacts[result.match];
        saveContacts(contacts);
        return true;
    }
    return false;
}

export function getContactAddress(name) {
    if (!name || typeof name !== 'string') return null;
    const contacts = loadContacts();

    // Case-insensitive lookup
    const normalized = name.toLowerCase();
    const key = Object.keys(contacts).find(k => k.toLowerCase() === normalized);

    return key ? contacts[key] : null;
}
