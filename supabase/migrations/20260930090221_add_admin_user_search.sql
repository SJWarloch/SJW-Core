-- ============================================================
-- SJW CORE - ADMIN USER SEARCH
-- ============================================================

create or replace function public.admin_search_users(
    search_term text
)
returns table (
    user_id uuid,
    email text,
    username text,
    display_name text,
    created_at timestamptz,
    credit_balance bigint
)
language sql
stable
security definer
set search_path = ''
as $$

    select
        p.id as user_id,
        u.email,
        p.username,
        p.display_name,
        p.created_at,

        coalesce(
            (
                select sum(cl.amount)
                from public.credit_ledger cl
                where cl.user_id = p.id
            ),
            0
        )::bigint as credit_balance

    from public.profiles p

    join auth.users u
        on u.id = p.id

    where
        length(trim(search_term)) >= 2

        and (
            position(
                lower(trim(search_term))
                in lower(coalesce(u.email, ''))
            ) > 0

            or

            position(
                lower(trim(search_term))
                in lower(coalesce(p.username, ''))
            ) > 0

            or

            position(
                lower(trim(search_term))
                in lower(coalesce(p.display_name, ''))
            ) > 0
        )

    order by
        p.username nulls last,
        p.display_name nulls last,
        u.email

    limit 25;

$$;


-- This function exposes sensitive account information.
-- Nobody except trusted server-side code may call it.

revoke execute
    on function public.admin_search_users(text)
    from public, anon, authenticated;


grant execute
    on function public.admin_search_users(text)
    to service_role;