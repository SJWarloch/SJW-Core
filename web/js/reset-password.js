import { supabaseClient } from "/js/supabase-client.js";
import { setStatusMessage } from "/js/auth-common.js";

const resetStatus = document.getElementById("resetStatus");
const resetSection = document.getElementById("resetSection");
const newPassword = document.getElementById("newPassword");
const confirmPassword = document.getElementById("confirmPassword");
const updatePasswordBtn = document.getElementById("updatePasswordBtn");
const resetResult = document.getElementById("resetResult");

let recoverySessionReady = false;
let recoveryEventSeen = false;

function activateRecoveryForm() {
    recoverySessionReady = true;
    recoveryEventSeen = true;
    resetStatus.textContent = "Recovery link verified. Choose a new password.";
    resetSection.hidden = false;
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session) {
        activateRecoveryForm();
    }
});

updatePasswordBtn.addEventListener("click", async () => {
    setStatusMessage(resetResult, "");

    if (!recoverySessionReady) {
        setStatusMessage(resetResult, "The password-reset session is not ready.", "error");
        return;
    }

    const password = newPassword.value;
    const confirmation = confirmPassword.value;

    if (password.length < 8) {
        setStatusMessage(resetResult, "Password must contain at least 8 characters.", "error");
        return;
    }

    if (password !== confirmation) {
        setStatusMessage(resetResult, "Passwords do not match.", "error");
        return;
    }

    updatePasswordBtn.disabled = true;
    const { error } = await supabaseClient.auth.updateUser({ password });
    updatePasswordBtn.disabled = false;

    if (error) {
        setStatusMessage(resetResult, `Unable to update password: ${error.message}`, "error");
        return;
    }

    newPassword.value = "";
    confirmPassword.value = "";
    resetSection.hidden = true;
    resetStatus.textContent = "Password updated successfully.";
    setStatusMessage(
        resetResult,
        "You can now return to the sign-in page and use your new password.",
        "success"
    );
});

// If the page was opened manually or the recovery link is invalid/expired,
// avoid leaving the user on an eternal "verifying" message.
window.setTimeout(() => {
    if (recoveryEventSeen) return;

    resetStatus.textContent = "This page requires a valid password-recovery link.";
    resetSection.hidden = true;
    setStatusMessage(
        resetResult,
        "Request a fresh password-reset email from the sign-in page.",
        "error"
    );
}, 1500);
