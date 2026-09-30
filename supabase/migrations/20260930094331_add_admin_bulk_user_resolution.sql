-- ============================================================
-- SJW CORE - ADMIN BULK USER RESOLUTION
-- ============================================================
--
-- Converts exact email addresses or usernames into SJW user IDs.
--
-- This exists only for trusted server-side administrative code.
--

create or replace function public.admin_resolve_users(
    identifiers text[]
)
returns table (
    input_identifier text,
    user_id uuid,
    email text,
    username text,
    display_name text
)
language sql
stable
security definer
set search_path = ''
as $$

    with requested as (

        select
            trim(identifier) as input_identifier,
            ordinality

        from unnest(identifiers)
            with ordinality as t(identifier, ordinality)

        where trim(identifier) <> ''

    )

    select
        r.input_identifier,
        m.user_id,
        m.email,
        m.username,
        m.display_name

    from requested r

    left join lateral (

        select
            p.id as user_id,
            u.email,
            p.username,
            p.display_name

        from public.profiles p

        join auth.users u
            on u.id = p.id

        where
            lower(coalesce(u.email, ''))
                = lower(r.input_identifier)

            or

            lower(coalesce(p.username, ''))
                = lower(r.input_identifier)

        limit 1

    ) m on true

    order by r.ordinality;

$$;


-- This can expose email addresses and account IDs,
-- so normal users must never call it directly.

revoke execute
    on function public.admin_resolve_users(text[])
    from public, anon, authenticated;


grant execute
    on function public.admin_resolve_users(text[])
    to service_role;