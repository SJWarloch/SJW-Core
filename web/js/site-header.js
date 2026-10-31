import { supabaseClient } from "/js/supabase-client.js";

async function updateAccountNavigation() {
    const links = document.querySelectorAll("#accountNavLink");
    if (!links.length) return;

    const { data } = await supabaseClient.auth.getSession();
    const session = data.session;

    if (!session) {
        for (const link of links) {
            link.href = "/login.html";
            link.textContent = "Sign in";
        }
        return;
    }

    let label = "Account";

    try {
        const { data: profile } = await supabaseClient
            .from("profiles")
            .select("username")
            .eq("id", session.user.id)
            .maybeSingle();

        if (profile?.username) {
            label = profile.username;
        }
    } catch {
        // A header should never prevent the rest of a page from loading.
    }

    for (const link of links) {
        link.href = "/account.html";
        link.textContent = label;
    }
}

supabaseClient.auth.onAuthStateChange(() => {
    window.setTimeout(updateAccountNavigation, 0);
});

updateAccountNavigation();
