-- ============================================================
-- SJW CORE - USERNAME VALIDATION
-- ============================================================

alter table public.profiles
add constraint profiles_username_format_check
check (
    username is null
    or (
        char_length(username) between 3 and 32
        and username ~ '^[A-Za-z0-9_]+$'
    )
);