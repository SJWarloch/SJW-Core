import { supabaseClient } from "/js/supabase-client.js";
import { ROUTES, formatFunctionError } from "/js/auth-common.js";

const adminStatus = document.getElementById("adminStatus");
const adminLoginRequired = document.getElementById("adminLoginRequired");
const adminPanel = document.getElementById("adminPanel");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");
const userSearchInput = document.getElementById("userSearch");
const searchBtn = document.getElementById("searchBtn");
const searchResults = document.getElementById("searchResults");
const userIdInput = document.getElementById("userId");
const amountInput = document.getElementById("amount");
const entryTypeInput = document.getElementById("entryType");
const sourceReferenceInput = document.getElementById("sourceReference");
const descriptionInput = document.getElementById("description");
const applyBtn = document.getElementById("applyBtn");
const result = document.getElementById("result");
const bulkEntryType = document.getElementById("bulkEntryType");
const bulkSourceReference = document.getElementById("bulkSourceReference");
const bulkDescription = document.getElementById("bulkDescription");
const bulkInput = document.getElementById("bulkInput");
const previewBulkBtn = document.getElementById("previewBulkBtn");
const applyBulkBtn = document.getElementById("applyBulkBtn");
const bulkResult = document.getElementById("bulkResult");

let pendingBulkTransactions = null;
let pendingBulkBatchId = null;

function parseBulkInput() {
    const lines = bulkInput.value
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const parsed = [];

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        const pieces = lines[lineNumber].split(",");

        if (pieces.length < 2) {
            throw new Error(`Line ${lineNumber + 1} needs at least a recipient and amount.`);
        }

        const identifier = pieces.shift().trim();
        const amountText = pieces.shift().trim();
        const description = pieces.join(",").trim();
        const amount = Number(amountText);

        if (!identifier) {
            throw new Error(`Line ${lineNumber + 1} has no recipient.`);
        }

        if (!Number.isSafeInteger(amount) || amount === 0) {
            throw new Error(`Line ${lineNumber + 1} has an invalid amount.`);
        }

        parsed.push({ identifier, amount, description });
    }

    if (!parsed.length) {
        throw new Error("Enter at least one transaction.");
    }

    if (parsed.length > 500) {
        throw new Error("A batch may contain at most 500 transactions.");
    }

    return parsed;
}

function invalidateBulkPreview() {
    if (!pendingBulkTransactions) return;

    pendingBulkTransactions = null;
    pendingBulkBatchId = null;
    applyBulkBtn.disabled = true;
    bulkResult.textContent = "Batch changed since preview. Preview again before applying.";
}

async function updatePage() {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
        adminStatus.textContent = `Session error: ${error.message}`;
        adminLoginRequired.hidden = false;
        adminPanel.hidden = true;
        adminLogoutBtn.hidden = true;
        return;
    }

    if (!data.session) {
        adminStatus.textContent = "Not signed in.";
        adminLoginRequired.hidden = false;
        adminPanel.hidden = true;
        adminLogoutBtn.hidden = true;
        return;
    }

    adminStatus.textContent = `Signed in as ${data.session.user.email}. Privileged operations are validated server-side.`;
    adminLoginRequired.hidden = true;
    adminPanel.hidden = false;
    adminLogoutBtn.hidden = false;
}

searchBtn.addEventListener("click", async () => {
    const searchTerm = userSearchInput.value.trim();

    if (searchTerm.length < 2) {
        searchResults.textContent = "Enter at least 2 characters.";
        return;
    }

    searchResults.textContent = "Searching…";
    searchBtn.disabled = true;

    const { data, error } = await supabaseClient.functions.invoke(
        "admin-user-search",
        { body: { search_term: searchTerm } }
    );

    searchBtn.disabled = false;

    if (error) {
        searchResults.textContent = `Search error:\n${await formatFunctionError(error)}`;
        return;
    }

    const users = data?.users ?? [];

    if (!users.length) {
        searchResults.textContent = "No matching users.";
        return;
    }

    searchResults.innerHTML = "";

    for (const user of users) {
        const row = document.createElement("div");
        row.className = "search-result";

        const meta = document.createElement("div");
        meta.className = "search-result__meta";

        const primary = document.createElement("strong");
        primary.textContent = user.username ?? user.display_name ?? "(no username)";

        const secondary = document.createElement("span");
        secondary.textContent = `${user.email} · Credits: ${user.credit_balance}`;

        meta.append(primary, secondary);

        const selectButton = document.createElement("button");
        selectButton.className = "button button--secondary button--small";
        selectButton.type = "button";
        selectButton.textContent = "Select";

        selectButton.addEventListener("click", () => {
            userIdInput.value = user.user_id;
            result.textContent =
                `Selected user:\n\n` +
                `Email: ${user.email}\n` +
                `Username: ${user.username ?? "(none)"}\n` +
                `Display name: ${user.display_name ?? "(none)"}\n` +
                `Current Credits: ${user.credit_balance}\n` +
                `UUID: ${user.user_id}`;
        });

        row.append(meta, selectButton);
        searchResults.appendChild(row);
    }
});

applyBtn.addEventListener("click", async () => {
    result.textContent = "Submitting…";
    applyBtn.disabled = true;

    const userId = userIdInput.value.trim();
    const amount = Number(amountInput.value);

    if (!userId) {
        result.textContent = "Target user UUID is required.";
        applyBtn.disabled = false;
        return;
    }

    if (!Number.isSafeInteger(amount) || amount === 0) {
        result.textContent = "Amount must be a non-zero whole number.";
        applyBtn.disabled = false;
        return;
    }

    const idempotencyKey = `manual:${crypto.randomUUID()}`;

    const { data, error } = await supabaseClient.functions.invoke(
        "admin-credit",
        {
            body: {
                user_id: userId,
                amount,
                entry_type: entryTypeInput.value,
                source_reference: sourceReferenceInput.value.trim() || null,
                idempotency_key: idempotencyKey,
                description: descriptionInput.value.trim() || null
            }
        }
    );

    applyBtn.disabled = false;

    if (error) {
        result.textContent = `ERROR\n\n${await formatFunctionError(error)}`;
        return;
    }

    result.textContent =
        `SUCCESS\n\n${JSON.stringify(data, null, 2)}\n\n` +
        `Idempotency key:\n${idempotencyKey}`;
});

previewBulkBtn.addEventListener("click", async () => {
    pendingBulkTransactions = null;
    pendingBulkBatchId = null;
    applyBulkBtn.disabled = true;
    bulkResult.textContent = "Preparing preview…";

    let parsed;
    try {
        parsed = parseBulkInput();
    } catch (error) {
        bulkResult.textContent = `ERROR\n\n${error.message}`;
        return;
    }

    const { data, error } = await supabaseClient.functions.invoke(
        "admin-resolve-users",
        { body: { identifiers: parsed.map(item => item.identifier) } }
    );

    if (error) {
        bulkResult.textContent = `ERROR\n\n${await formatFunctionError(error)}`;
        return;
    }

    const resolvedUsers = data?.users ?? [];

    if (resolvedUsers.length !== parsed.length) {
        bulkResult.textContent = "ERROR\n\nResolver returned an unexpected number of rows.";
        return;
    }

    let hasErrors = false;
    const seenUserIds = new Set();
    const previewLines = [];
    let totalCredits = 0;

    for (let i = 0; i < parsed.length; i++) {
        const request = parsed[i];
        const resolved = resolvedUsers[i];

        if (!resolved.user_id) {
            hasErrors = true;
            previewLines.push(`NOT FOUND: ${request.identifier}`);
            continue;
        }

        if (seenUserIds.has(resolved.user_id)) {
            hasErrors = true;
            previewLines.push(`DUPLICATE USER: ${request.identifier}`);
            continue;
        }

        seenUserIds.add(resolved.user_id);
        totalCredits += request.amount;

        previewLines.push(
            `${request.identifier} -> ${resolved.username ?? resolved.email} : ` +
            `${request.amount > 0 ? "+" : ""}${request.amount}`
        );
    }

    previewLines.push("", `Recipients: ${parsed.length}`);
    previewLines.push(`Net Credits: ${totalCredits > 0 ? "+" : ""}${totalCredits}`);

    if (hasErrors) {
        previewLines.push("", "BATCH CANNOT BE APPLIED.");
        previewLines.push("Fix unresolved or duplicate recipients and preview again.");
        bulkResult.textContent = previewLines.join("\n");
        return;
    }

    pendingBulkBatchId = crypto.randomUUID();
    pendingBulkTransactions = parsed.map((request, index) => ({
        user_id: resolvedUsers[index].user_id,
        amount: request.amount,
        entry_type: bulkEntryType.value,
        source_reference: bulkSourceReference.value.trim() || null,
        idempotency_key: `admin-bulk:${pendingBulkBatchId}:${index}`,
        description: request.description || bulkDescription.value.trim() || null
    }));

    bulkResult.textContent = previewLines.join("\n");
    applyBulkBtn.disabled = false;
});

applyBulkBtn.addEventListener("click", async () => {
    if (!pendingBulkTransactions?.length) {
        bulkResult.textContent = "No valid batch is currently prepared.";
        return;
    }

    applyBulkBtn.disabled = true;
    previewBulkBtn.disabled = true;
    bulkResult.textContent += "\n\nApplying batch…";

    const { data, error } = await supabaseClient.functions.invoke(
        "admin-credit",
        { body: { transactions: pendingBulkTransactions } }
    );

    previewBulkBtn.disabled = false;

    if (error) {
        bulkResult.textContent += `\n\nERROR\n${await formatFunctionError(error)}`;
        applyBulkBtn.disabled = false;
        return;
    }

    bulkResult.textContent +=
        `\n\nSUCCESS\nInserted: ${data?.inserted ?? pendingBulkTransactions.length} ledger entries.` +
        `\nBatch ID: ${pendingBulkBatchId}`;

    pendingBulkTransactions = null;
    pendingBulkBatchId = null;
});

for (const element of [bulkInput, bulkSourceReference, bulkDescription]) {
    element.addEventListener("input", invalidateBulkPreview);
}

bulkEntryType.addEventListener("change", invalidateBulkPreview);

adminLogoutBtn.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.replace(ROUTES.home);
});

supabaseClient.auth.onAuthStateChange(() => {
    window.setTimeout(updatePage, 0);
});

updatePage();
