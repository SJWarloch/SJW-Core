import { supabaseClient } from "/js/supabase-client.js";

const AFTER_LOGIN_KEY = "sjw_after_login";
const FLASH_KEY = "sjw_flash_message";

export const ROUTES = Object.freeze({
    home: "/",
    login: "/login.html",
    account: "/account.html",
    resetPassword: "/reset-password.html",
    admin: "/admin.html"
});

export function absoluteRoute(path) {
    return new URL(path, window.location.origin).toString();
}

export function isValidEmail(email) {
    return typeof email === "string" && email.includes("@") && email.length >= 3;
}

export function setStatusMessage(element, message, type = "info") {
    if (!element) return;

    element.textContent = message ?? "";
    element.hidden = !message;
    element.classList.remove(
        "status-message--error",
        "status-message--success",
        "status-message--warning"
    );

    if (type === "error") {
        element.classList.add("status-message--error");
    } else if (type === "success") {
        element.classList.add("status-message--success");
    } else if (type === "warning") {
        element.classList.add("status-message--warning");
    }
}

export function setInlineMessage(element, message, type = "info") {
    if (!element) return;
    element.textContent = message ?? "";
    element.classList.remove("error", "success");
    if (type === "error") element.classList.add("error");
    if (type === "success") element.classList.add("success");
}

export function sanitizeLocalPath(value) {
    if (!value) return null;

    try {
        const url = new URL(value, window.location.origin);
        if (url.origin !== window.location.origin) return null;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return null;
    }
}

export function rememberNextFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const next = sanitizeLocalPath(params.get("next"));

    if (next && next !== ROUTES.login) {
        window.sessionStorage.setItem(AFTER_LOGIN_KEY, next);
    }
}

export function consumePostLoginRedirect(fallback = ROUTES.account) {
    const saved = sanitizeLocalPath(window.sessionStorage.getItem(AFTER_LOGIN_KEY));
    window.sessionStorage.removeItem(AFTER_LOGIN_KEY);
    return saved || fallback;
}

export function setFlashMessage(message, type = "info") {
    window.sessionStorage.setItem(
        FLASH_KEY,
        JSON.stringify({ message, type })
    );
}

export function consumeFlashMessage() {
    const raw = window.sessionStorage.getItem(FLASH_KEY);
    window.sessionStorage.removeItem(FLASH_KEY);

    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.message) return null;
        return {
            message: String(parsed.message),
            type: parsed.type || "info"
        };
    } catch {
        return null;
    }
}

export function handleOAuthCallbackError(targetElement, context = "login") {
    const url = new URL(window.location.href);
    const error = url.searchParams.get("error");
    const errorCode = url.searchParams.get("error_code");
    const errorDescription = url.searchParams.get("error_description");

    if (!error) return false;

    let message;

    if (
        errorCode === "unexpected_failure" &&
        errorDescription === "Error creating identity"
    ) {
        message = context === "link"
            ? "Google could not be linked to this SJW account. The Google identity may already belong to another SJW account, the account may already have a Google identity, or the linking request may no longer be valid."
            : "Google sign-in could not be completed. If this email already belongs to an SJW account, sign in using the account's existing login method and link Google manually from Account Settings.";
    } else if (error === "access_denied") {
        message = "Google authentication was cancelled.";
    } else {
        message = "Google authentication could not be completed." +
            (errorDescription ? ` ${errorDescription}` : "");
    }

    setStatusMessage(targetElement, message, "error");

    for (const key of ["error", "error_code", "error_description"]) {
        url.searchParams.delete(key);
    }

    window.history.replaceState(
        {},
        document.title,
        `${url.pathname}${url.search}${url.hash}`
    );

    return true;
}

export async function getCurrentSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data.session;
}

export async function formatFunctionError(error) {
    let details = error?.message || "Unknown server error.";

    try {
        if (error?.context) {
            const body = await error.context.clone().json();
            if (body) {
                details += `\n\n${JSON.stringify(body, null, 2)}`;
            }
        }
    } catch {
        // Preserve the normal error message if no JSON body is available.
    }

    return details;
}
