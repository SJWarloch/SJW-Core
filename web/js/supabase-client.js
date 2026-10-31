const SUPABASE_URL = "https://ersyehphlrwpdidagqvt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8v5kG8lwO8rsXOp_50wjaA_fcV1PfEh";

if (!window.supabase) {
    throw new Error("Supabase client library failed to load.");
}

export const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);
