-- ============================================================
-- SJW CORE - IDENTITY LINKING POLICY
-- ============================================================
--
-- Goals:
--
-- 1. Detect password login from the actual Supabase Auth record.
-- 2. Require explicit permission before adding an external
--    identity to an existing SJW account.
-- 3. Bind that permission to the user's CURRENT auth session.
-- 4. Expire permissions after 10 minutes.
-- 5. Permit at most one identity from each external provider.
-- 6. Consume a permission after one successful identity link.
--
-- Supabase still performs all actual authentication.
-- This layer only imposes stricter SJW linking policy.


-- ============================================================
-- 1. TEMPORARY IDENTITY-LINK INTENTS
-- ============================================================

create table public.identity_link_intents (

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    provider text not null,

    -- Every Supabase login session has a unique session UUID.
    --
    -- Linking permission belongs to THAT login session, not just
    -- to the account in general.
    --
    -- When the session disappears, PostgreSQL automatically
    -- deletes this intent because of ON DELETE CASCADE.

    session_id uuid not null
        references auth.sessions(id)
        on delete cascade,

    created_at timestamptz not null
        default now(),

    expires_at timestamptz not null,

    -- Exactly one active intent per account/provider.
    --
    -- Clicking "Link Google" again refreshes this row instead of
    -- creating another independent timer.

    primary key (
        user_id,
        provider
    ),

    check (
        expires_at > created_at
    )
);


alter table public.identity_link_intents
    enable row level security;


-- Clients never manipulate this table directly.
--
-- They must go through the narrowly-defined functions below.

revoke all
    on table public.identity_link_intents
    from public, anon, authenticated;


-- ============================================================
-- 2. REAL PASSWORD-LOGIN STATUS
-- ============================================================
--
-- Supabase currently has a known issue where adding a password
-- to an OAuth-created account successfully enables password
-- login but does NOT necessarily create an "email" identity.
--
-- Therefore we ask auth.users directly whether a password hash
-- exists.
--
-- The browser receives only TRUE/FALSE. It never receives the
-- hash itself.

create or replace function public.get_my_password_login_status()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$

    select exists (

        select 1

        from auth.users u

        where
            u.id = (
                select auth.uid()
            )

            and coalesce(
                u.encrypted_password,
                ''
            ) <> ''

    );

$$;


revoke execute
    on function public.get_my_password_login_status()
    from public, anon;


grant execute
    on function public.get_my_password_login_status()
    to authenticated;


-- ============================================================
-- 3. BEGIN AN EXPLICIT IDENTITY-LINK ATTEMPT
-- ============================================================

create or replace function public.begin_identity_link(
    link_provider text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$

declare

    v_user_id uuid;

    v_session_id uuid;

    v_provider text;

    v_expires_at timestamptz;

begin

    v_user_id :=
        auth.uid();


    v_session_id :=
        nullif(
            auth.jwt() ->> 'session_id',
            ''
        )::uuid;


    v_provider :=
        lower(
            trim(link_provider)
        );


    -- --------------------------------------------------------
    -- Must actually be logged in.
    -- --------------------------------------------------------

    if v_user_id is null
        or v_session_id is null
    then

        raise exception
            'A valid authenticated session is required.';

    end if;


    -- --------------------------------------------------------
    -- Only providers SJW has explicitly approved for external
    -- account linking may use this function.
    --
    -- We are only using Google today, but this prepares us for
    -- the providers we already know we want later.
    -- --------------------------------------------------------

    if v_provider not in (
        'google',
        'apple',
        'discord',
        'twitch'
    )
    then

        raise exception
            'Unsupported identity provider.';

    end if;


    -- --------------------------------------------------------
    -- Verify that this JWT's session still exists and actually
    -- belongs to this user.
    --
    -- This is what kills the abandoned-intent-then-logout edge
    -- case.
    -- --------------------------------------------------------

    if not exists (

        select 1

        from auth.sessions s

        where
            s.id = v_session_id
            and s.user_id = v_user_id

    )
    then

        raise exception
            'The current authentication session is no longer active.';

    end if;


    -- --------------------------------------------------------
    -- SJW permits at most ONE identity from each external
    -- provider.
    -- --------------------------------------------------------

    if exists (

        select 1

        from auth.identities i

        where
            i.user_id = v_user_id
            and i.provider = v_provider

    )
    then

        raise exception
            'This SJW account already has a % identity linked.',
            v_provider;

    end if;


    -- --------------------------------------------------------
    -- Ten minutes is deliberately generous enough for OAuth,
    -- MFA, slow connections, etc., while remaining temporary.
    -- --------------------------------------------------------

    v_expires_at :=
        now() + interval '10 minutes';


    -- --------------------------------------------------------
    -- UPSERT rather than INSERT:
    --
    -- If Alice presses Link Google twice, she does NOT receive
    -- two independent permissions.
    --
    -- The second click simply replaces/refreshes the first.
    -- --------------------------------------------------------

    insert into public.identity_link_intents (
        user_id,
        provider,
        session_id,
        created_at,
        expires_at
    )
    values (
        v_user_id,
        v_provider,
        v_session_id,
        now(),
        v_expires_at
    )

    on conflict (
        user_id,
        provider
    )

    do update set
        session_id = excluded.session_id,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at;


    return v_expires_at;

end;

$$;


revoke execute
    on function public.begin_identity_link(text)
    from public, anon;


grant execute
    on function public.begin_identity_link(text)
    to authenticated;


-- ============================================================
-- 4. CANCEL AN INTENT
-- ============================================================
--
-- Mostly useful if Supabase fails before it even redirects to
-- Google. Abandoned successful redirects simply expire naturally
-- or disappear when their login session ends.

create or replace function public.cancel_identity_link(
    link_provider text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$

declare

    v_user_id uuid;

    v_session_id uuid;

    v_provider text;

begin

    v_user_id :=
        auth.uid();


    v_session_id :=
        nullif(
            auth.jwt() ->> 'session_id',
            ''
        )::uuid;


    v_provider :=
        lower(
            trim(link_provider)
        );


    if v_user_id is null
        or v_session_id is null
    then

        return;

    end if;


    delete from public.identity_link_intents

    where
        user_id = v_user_id
        and provider = v_provider
        and session_id = v_session_id;

end;

$$;


revoke execute
    on function public.cancel_identity_link(text)
    from public, anon;


grant execute
    on function public.cancel_identity_link(text)
    to authenticated;


-- ============================================================
-- 5. ENFORCE SJW'S IDENTITY-LINKING POLICY
-- ============================================================
--
-- Supabase itself normally performs automatic identity linking
-- when an OAuth provider returns the same verified email as an
-- existing user.
--
-- There is currently no documented hosted-project switch for
-- disabling that automatic behavior.
--
-- This trigger therefore imposes SJW's stricter policy at the
-- point where Supabase attempts to INSERT the new identity.
--
-- Supabase explicitly permits custom triggers on auth.identities.

create or replace function public.enforce_identity_link_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$

declare

    v_existing_identity_count integer;

    v_intent_session_id uuid;

begin

    -- --------------------------------------------------------
    -- EMAIL AND PHONE
    -- --------------------------------------------------------
    --
    -- These are native credential types rather than external
    -- social-provider identities.
    --
    -- We allow Supabase to manage them normally.
    --
    -- We still prohibit multiple identities of the SAME type
    -- for one user.
    -- --------------------------------------------------------

    if new.provider in (
        'email',
        'phone'
    )
    then

        if exists (

            select 1

            from auth.identities i

            where
                i.user_id = new.user_id
                and i.provider = new.provider

        )
        then

            raise exception
                'This account already has a % identity.',
                new.provider;

        end if;


        return new;

    end if;


    -- --------------------------------------------------------
    -- EXTERNAL PROVIDERS:
    -- never allow two identities from the same provider.
    -- --------------------------------------------------------

    if exists (

        select 1

        from auth.identities i

        where
            i.user_id = new.user_id
            and i.provider = new.provider

    )
    then

        raise exception
            'This SJW account already has a % account linked.',
            new.provider;

    end if;


    -- --------------------------------------------------------
    -- Is this the FIRST identity belonging to a brand-new user?
    --
    -- If yes, this is an ordinary new OAuth signup rather than
    -- an account merge, so no linking permission is needed.
    -- --------------------------------------------------------

    select count(*)

    into v_existing_identity_count

    from auth.identities i

    where
        i.user_id = new.user_id;


    if v_existing_identity_count = 0
    then

        return new;

    end if;


    -- --------------------------------------------------------
    -- This is an EXISTING user receiving another external
    -- identity.
    --
    -- Require:
    --
    --   * matching user
    --   * matching provider
    --   * intent not expired
    --   * original login session still exists
    --   * session belongs to this user
    --
    -- FOR UPDATE ensures two concurrent insert attempts cannot
    -- both consume the same permission.
    -- --------------------------------------------------------

    select intent.session_id

    into v_intent_session_id

    from public.identity_link_intents intent

    join auth.sessions session
        on session.id = intent.session_id
        and session.user_id = intent.user_id

    where
        intent.user_id = new.user_id
        and intent.provider = new.provider
        and intent.expires_at > now()

    for update of intent;


    if not found
    then

        raise exception
            'External identity linking must be explicitly initiated from SJW account settings.';

    end if;


    -- --------------------------------------------------------
    -- ONE USE.
    --
    -- Consume the permission immediately once the identity is
    -- accepted.
    -- --------------------------------------------------------

    delete from public.identity_link_intents

    where
        user_id = new.user_id
        and provider = new.provider
        and session_id = v_intent_session_id;


    return new;

end;

$$;


revoke execute
    on function public.enforce_identity_link_policy()
    from public, anon, authenticated;


-- ============================================================
-- 6. INSTALL THE TRIGGER ON SUPABASE AUTH IDENTITIES
-- ============================================================

drop trigger if exists
    sjw_enforce_identity_link_policy
    on auth.identities;


create trigger sjw_enforce_identity_link_policy

    before insert
    on auth.identities

    for each row

    execute function
        public.enforce_identity_link_policy();