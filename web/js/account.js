import { supabaseClient } from "/js/supabase-client.js";
import {
    ROUTES,
    absoluteRoute,
    formatFunctionError,
    handleOAuthCallbackError,
    setFlashMessage,
    setInlineMessage,
    setStatusMessage
} from "/js/auth-common.js";

const status = document.getElementById("status");
const credits = document.getElementById("credits");
const oauthMessage = document.getElementById("oauthMessage");
const accountMessage = document.getElementById("accountMessage");
const accountContent = document.getElementById("accountContent");
const currentUsername = document.getElementById("currentUsername");
const usernameInput = document.getElementById("usernameInput");
const saveUsernameBtn = document.getElementById("saveUsernameBtn");
const usernameResult = document.getElementById("usernameResult");
const accountEmail = document.getElementById("accountEmail");
const emailPasswordStatus = document.getElementById("emailPasswordStatus");
const googleStatus = document.getElementById("googleStatus");
const passwordHeading = document.getElementById("passwordHeading");
const accountPassword = document.getElementById("accountPassword");
const accountPasswordConfirm = document.getElementById("accountPasswordConfirm");
const setPasswordBtn = document.getElementById("setPasswordBtn");
const passwordResult = document.getElementById("passwordResult");
const linkGoogleBtn = document.getElementById("linkGoogleBtn");
const unlinkGoogleBtn = document.getElementById("unlinkGoogleBtn");
const identityResult = document.getElementById("identityResult");
const logoutBtn = document.getElementById("logoutBtn");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");
const deleteAccountResult = document.getElementById("deleteAccountResult");

const LINK_MARKER_KEY = "sjw_google_link_started";

let currentUser = null;
let currentGoogleIdentity = null;
let currentHasPasswordLogin = false;

const oauthFailed = handleOAuthCallbackError(oauthMessage, "link");
if (oauthFailed) {
    window.sessionStorage.removeItem(LINK_MARKER_KEY);
}

async function requireSession() {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
        setStatusMessage(accountMessage, `Unable to read your session: ${error.message}`, "error");
        return null;
    }

    if (!data.session) {
        window.location.replace(`${ROUTES.login}?next=${encodeURIComponent(ROUTES.account)}`);
        return null;
    }

    currentUser = data.session.user;
    return data.session;
}

async function loadProfile() {
    const { data, error } = await supabaseClient
        .from("profiles")
        .select("username, display_name")
        .eq("id", currentUser.id)
        .single();

    if (error) {
        currentUsername.textContent = "Unable to load";
        usernameInput.value = "";
        setInlineMessage(usernameResult, `Profile error: ${error.message}`, "error");
        return;
    }

    currentUsername.textContent = data.username ?? "(none)";
    usernameInput.value = data.username ?? "";
}

async function loadCredits() {
    const { data, error } = await supabaseClient.rpc("get_my_credit_balance");

    credits.textContent = error ? "—" : data;

    if (error) {
        setStatusMessage(accountMessage, `Credits could not be loaded: ${error.message}`, "error");
    }
}

async function loadAuthenticationMethods() {
    currentGoogleIdentity = null;
    currentHasPasswordLogin = false;
    linkGoogleBtn.hidden = true;
    unlinkGoogleBtn.hidden = true;

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !userData.user) {
        accountEmail.textContent = "Unable to load";
        emailPasswordStatus.textContent = "Unable to load";
        googleStatus.textContent = "Unable to load";
        return;
    }

    const user = userData.user;
    accountEmail.textContent = user.email ?? "(no email)";

    const { data: hasPasswordLogin, error: passwordStatusError } =
        await supabaseClient.rpc("get_my_password_login_status");

    if (passwordStatusError) {
        emailPasswordStatus.textContent = "Unable to load";
    } else {
        currentHasPasswordLogin = hasPasswordLogin === true;
        emailPasswordStatus.textContent = currentHasPasswordLogin ? "Available" : "Not configured";
        passwordHeading.textContent = currentHasPasswordLogin ? "Change password" : "Add email/password login";
        setPasswordBtn.textContent = currentHasPasswordLogin ? "Change password" : "Add password";
    }

    const { data: identityData, error: identityError } =
        await supabaseClient.auth.getUserIdentities();

    if (identityError) {
        googleStatus.textContent = "Unable to load";
        return;
    }

    const identities = identityData?.identities ?? [];
    const googleIdentities = identities.filter(identity => identity.provider === "google");

    currentGoogleIdentity = googleIdentities.length
        ? googleIdentities[googleIdentities.length - 1]
        : null;

    if (!googleIdentities.length) {
        googleStatus.textContent = "Not linked";
        linkGoogleBtn.hidden = false;
        return;
    }

    const linkedEmails = googleIdentities
        .map(identity => identity?.identity_data?.email)
        .filter(Boolean);

    if (googleIdentities.length === 1) {
        googleStatus.textContent = linkedEmails.length
            ? `Linked — ${linkedEmails[0]}`
            : "Linked";
    } else {
        googleStatus.textContent =
            `WARNING: ${googleIdentities.length} Google accounts are linked: ${linkedEmails.join(", ")}`;
    }

    if (currentGoogleIdentity && identities.length > 1) {
        unlinkGoogleBtn.hidden = false;
    }
}

async function refreshAccount() {
    if (!currentUser) return;

    status.textContent = `Signed in as ${currentUser.email ?? "SJW user"}`;
    accountContent.hidden = false;

    await Promise.all([
        loadProfile(),
        loadCredits(),
        loadAuthenticationMethods()
    ]);

    const linkStarted = window.sessionStorage.getItem(LINK_MARKER_KEY);
    if (linkStarted) {
        window.sessionStorage.removeItem(LINK_MARKER_KEY);
        if (currentGoogleIdentity && !oauthFailed) {
            setInlineMessage(identityResult, "Google account linked successfully.", "success");
        }
    }
}

saveUsernameBtn.addEventListener("click", async () => {
    setInlineMessage(usernameResult, "");

    const newUsername = usernameInput.value.trim();

    if (newUsername.length < 3 || newUsername.length > 32) {
        setInlineMessage(usernameResult, "Username must be between 3 and 32 characters.", "error");
        return;
    }

    if (!/^[A-Za-z0-9_]+$/.test(newUsername)) {
        setInlineMessage(usernameResult, "Username may contain only letters, numbers, and underscores.", "error");
        return;
    }

    saveUsernameBtn.disabled = true;

    const { data, error } = await supabaseClient
        .from("profiles")
        .update({ username: newUsername })
        .eq("id", currentUser.id)
        .select("username")
        .single();

    saveUsernameBtn.disabled = false;

    if (error) {
        if (error.code === "23505") {
            setInlineMessage(usernameResult, "That username is already taken.", "error");
        } else if (error.code === "23514") {
            setInlineMessage(usernameResult, "That username is not valid.", "error");
        } else {
            setInlineMessage(usernameResult, `Error: ${error.message}`, "error");
        }
        return;
    }

    currentUsername.textContent = data.username;
    setInlineMessage(usernameResult, "Username saved.", "success");
});

setPasswordBtn.addEventListener("click", async () => {
    setInlineMessage(passwordResult, "");

    const password = accountPassword.value;
    const confirmation = accountPasswordConfirm.value;

    if (password.length < 8) {
        setInlineMessage(passwordResult, "Password must contain at least 8 characters.", "error");
        return;
    }

    if (password !== confirmation) {
        setInlineMessage(passwordResult, "Passwords do not match.", "error");
        return;
    }

    const wasPasswordLoginAvailable = currentHasPasswordLogin;
    setPasswordBtn.disabled = true;

    const { error } = await supabaseClient.auth.updateUser({ password });
    setPasswordBtn.disabled = false;

    if (error) {
        setInlineMessage(passwordResult, `Unable to set password: ${error.message}`, "error");
        return;
    }

    accountPassword.value = "";
    accountPasswordConfirm.value = "";
    await loadAuthenticationMethods();

    setInlineMessage(
        passwordResult,
        wasPasswordLoginAvailable
            ? "Password changed successfully."
            : "Email/password login added successfully.",
        "success"
    );
});

linkGoogleBtn.addEventListener("click", async () => {
    setInlineMessage(identityResult, "");
    linkGoogleBtn.disabled = true;

    const { error: intentError } = await supabaseClient.rpc(
        "begin_identity_link",
        { link_provider: "google" }
    );

    if (intentError) {
        setInlineMessage(
            identityResult,
            `Unable to begin Google linking: ${intentError.message}`,
            "error"
        );
        linkGoogleBtn.disabled = false;
        return;
    }

    window.sessionStorage.setItem(LINK_MARKER_KEY, "1");

    const { error } = await supabaseClient.auth.linkIdentity({
        provider: "google",
        options: {
            redirectTo: absoluteRoute(ROUTES.account)
        }
    });

    if (error) {
        await supabaseClient.rpc("cancel_identity_link", { link_provider: "google" });
        window.sessionStorage.removeItem(LINK_MARKER_KEY);
        setInlineMessage(identityResult, `Unable to link Google account: ${error.message}`, "error");
        linkGoogleBtn.disabled = false;
    }
});

unlinkGoogleBtn.addEventListener("click", async () => {
    setInlineMessage(identityResult, "");

    if (!currentGoogleIdentity) {
        setInlineMessage(identityResult, "No Google identity is linked.", "error");
        return;
    }

    const confirmed = window.confirm(
        "Unlink Google from this SJW account?\n\nMake sure another login method works before continuing."
    );

    if (!confirmed) return;

    unlinkGoogleBtn.disabled = true;
    const { error } = await supabaseClient.auth.unlinkIdentity(currentGoogleIdentity);
    unlinkGoogleBtn.disabled = false;

    if (error) {
        setInlineMessage(identityResult, `Unable to unlink Google: ${error.message}`, "error");
        return;
    }

    await loadAuthenticationMethods();
    setInlineMessage(identityResult, "Google account unlinked.", "success");
});

logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        logoutBtn.disabled = false;
        setStatusMessage(accountMessage, `Logout error: ${error.message}`, "error");
        return;
    }

    window.location.replace(ROUTES.home);
});

deleteAccountBtn.addEventListener("click", async () => {
    setInlineMessage(deleteAccountResult, "");

    const confirmed = window.confirm(
        "Permanently delete your SJW account?\n\n" +
        "This will delete your current profile, Credits, and linked account data.\n\n" +
        "This action cannot be undone in the current build."
    );

    if (!confirmed) return;

    const typedConfirmation = window.prompt(
        "Type DELETE to permanently delete your account."
    );

    if (typedConfirmation !== "DELETE") {
        setInlineMessage(deleteAccountResult, "Account deletion cancelled.");
        return;
    }

    deleteAccountBtn.disabled = true;
    setInlineMessage(deleteAccountResult, "Deleting account…");

    const { data, error } = await supabaseClient.functions.invoke(
        "delete-my-account",
        { body: {} }
    );

    if (error) {
        const details = await formatFunctionError(error);
        setInlineMessage(deleteAccountResult, `Unable to delete account: ${details}`, "error");
        deleteAccountBtn.disabled = false;
        return;
    }

    if (!data?.success) {
        setInlineMessage(deleteAccountResult, "Account deletion did not complete.", "error");
        deleteAccountBtn.disabled = false;
        return;
    }

    await supabaseClient.auth.signOut({ scope: "local" });
    setFlashMessage("Your SJW account has been permanently deleted.", "success");
    window.location.replace(ROUTES.login);
});

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) {
        window.setTimeout(() => {
            window.location.replace(`${ROUTES.login}?next=${encodeURIComponent(ROUTES.account)}`);
        }, 0);
    }
});

const session = await requireSession();
if (session) {
    await refreshAccount();
}
