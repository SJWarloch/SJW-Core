import { supabaseClient } from "/js/supabase-client.js";
import {
    ROUTES,
    absoluteRoute,
    consumeFlashMessage,
    consumePostLoginRedirect,
    handleOAuthCallbackError,
    isValidEmail,
    rememberNextFromQuery,
    setStatusMessage
} from "/js/auth-common.js";

const pageMessage = document.getElementById("pageMessage");
const signInEmail = document.getElementById("signInEmail");
const signInPassword = document.getElementById("signInPassword");
const emailLoginBtn = document.getElementById("emailLoginBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const signUpEmail = document.getElementById("signUpEmail");
const signUpPassword = document.getElementById("signUpPassword");
const signUpPasswordConfirm = document.getElementById("signUpPasswordConfirm");
const emailSignUpBtn = document.getElementById("emailSignUpBtn");
const googleLoginBtn = document.getElementById("googleLoginBtn");

rememberNextFromQuery();
const oauthFailed = handleOAuthCallbackError(pageMessage, "login");

const flash = consumeFlashMessage();
if (flash && !oauthFailed) {
    setStatusMessage(pageMessage, flash.message, flash.type);
}

let redirecting = false;

function finishLogin() {
    if (redirecting) return;
    redirecting = true;
    window.location.replace(consumePostLoginRedirect(ROUTES.account));
}

async function redirectIfAlreadySignedIn() {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session && !oauthFailed) {
        finishLogin();
    }
}

emailLoginBtn.addEventListener("click", async () => {
    setStatusMessage(pageMessage, "");

    const email = signInEmail.value.trim();
    const password = signInPassword.value;

    if (!isValidEmail(email)) {
        setStatusMessage(pageMessage, "Enter a valid email address.", "error");
        return;
    }

    if (!password) {
        setStatusMessage(pageMessage, "Enter your password.", "error");
        return;
    }

    emailLoginBtn.disabled = true;

    const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    emailLoginBtn.disabled = false;

    if (error) {
        setStatusMessage(pageMessage, `Sign-in failed: ${error.message}`, "error");
        return;
    }

    signInPassword.value = "";
    finishLogin();
});

emailSignUpBtn.addEventListener("click", async () => {
    setStatusMessage(pageMessage, "");

    const email = signUpEmail.value.trim();
    const password = signUpPassword.value;
    const confirmPassword = signUpPasswordConfirm.value;

    if (!isValidEmail(email)) {
        setStatusMessage(pageMessage, "Enter a valid email address.", "error");
        return;
    }

    if (password.length < 8) {
        setStatusMessage(pageMessage, "Password must contain at least 8 characters.", "error");
        return;
    }

    if (password !== confirmPassword) {
        setStatusMessage(pageMessage, "Passwords do not match.", "error");
        return;
    }

    emailSignUpBtn.disabled = true;

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
    });

    emailSignUpBtn.disabled = false;

    if (error) {
        setStatusMessage(pageMessage, `Signup failed: ${error.message}`, "error");
        return;
    }

    signUpPassword.value = "";
    signUpPasswordConfirm.value = "";

    if (!data.session) {
        setStatusMessage(
            pageMessage,
            "If this address can be registered, a confirmation email has been sent. Check your inbox and follow the link before signing in.",
            "success"
        );
    } else {
        finishLogin();
    }
});

forgotPasswordBtn.addEventListener("click", async () => {
    setStatusMessage(pageMessage, "");

    const email = signInEmail.value.trim();

    if (!isValidEmail(email)) {
        setStatusMessage(
            pageMessage,
            "Enter your email address in the Sign In section first.",
            "error"
        );
        return;
    }

    forgotPasswordBtn.disabled = true;

    const { error } = await supabaseClient.auth.resetPasswordForEmail(
        email,
        { redirectTo: absoluteRoute(ROUTES.resetPassword) }
    );

    forgotPasswordBtn.disabled = false;

    if (error) {
        setStatusMessage(
            pageMessage,
            `Unable to request password reset: ${error.message}`,
            "error"
        );
        return;
    }

    setStatusMessage(
        pageMessage,
        "If an account is associated with that email address, a password-reset message has been sent.",
        "success"
    );
});

googleLoginBtn.addEventListener("click", async () => {
    setStatusMessage(pageMessage, "");
    googleLoginBtn.disabled = true;

    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo: absoluteRoute(ROUTES.login)
        }
    });

    if (error) {
        googleLoginBtn.disabled = false;
        setStatusMessage(pageMessage, `Google login error: ${error.message}`, "error");
    }
});

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
        window.setTimeout(finishLogin, 0);
    }
});

redirectIfAlreadySignedIn();
