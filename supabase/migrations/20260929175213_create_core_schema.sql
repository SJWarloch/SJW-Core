-- ============================================================
-- SJW CORE - INITIAL DATABASE SCHEMA
-- ============================================================


-- ------------------------------------------------------------
-- 1. PROFILES
-- ------------------------------------------------------------
--
-- Supabase Auth owns auth.users.
-- SJW keeps its own application-facing information here.
--
-- The profile ID is exactly the same UUID as the corresponding
-- Supabase Auth user ID.
--

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,

    username text,
    display_name text,

    created_at timestamptz not null default now()
);


-- Usernames, when present, must be unique regardless of case.
--
-- This means "Alice", "alice", and "ALICE" cannot belong to
-- three different users.
--
-- NULL usernames are allowed for now because a newly-created
-- account does not need to choose a username immediately.

create unique index profiles_username_lower_unique
    on public.profiles (lower(username))
    where username is not null;


-- ------------------------------------------------------------
-- 2. PROFILE SECURITY
-- ------------------------------------------------------------

alter table public.profiles enable row level security;


-- Start from "nobody gets anything", then deliberately grant
-- only the permissions we want.

revoke all on table public.profiles
    from anon, authenticated, service_role;


-- A logged-in user may read their profile.

grant select on table public.profiles
    to authenticated;


-- A logged-in user may change only these two columns.
--
-- They cannot change their user ID or account creation time.

grant update (username, display_name)
    on table public.profiles
    to authenticated;


-- Trusted SJW server-side code may manage profiles.

grant select, insert, update, delete
    on table public.profiles
    to service_role;


-- RLS policy:
-- a logged-in user can only SEE their own profile row.

create policy "Users can read own profile"
    on public.profiles
    for select
    to authenticated
    using (
        (select auth.uid()) = id
    );


-- RLS policy:
-- a logged-in user can only UPDATE their own profile row.

create policy "Users can update own profile"
    on public.profiles
    for update
    to authenticated
    using (
        (select auth.uid()) = id
    )
    with check (
        (select auth.uid()) = id
    );


-- ------------------------------------------------------------
-- 3. AUTOMATIC PROFILE CREATION
-- ------------------------------------------------------------
--
-- Whenever Supabase Auth creates a new user, automatically
-- create that user's SJW profile.
--

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin

    insert into public.profiles (
        id,
        display_name
    )
    values (
        new.id,
        coalesce(
            new.raw_user_meta_data ->> 'full_name',
            new.raw_user_meta_data ->> 'name'
        )
    );

    return new;

end;
$$;


create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute procedure public.handle_new_user();


-- The function exists for the database trigger, not for users
-- to call directly through the API.

revoke execute on function public.handle_new_user()
    from public, anon, authenticated;


-- ------------------------------------------------------------
-- 4. CREDIT LEDGER
-- ------------------------------------------------------------
--
-- THIS is the authoritative history of SJW Credits.
--
-- We intentionally do NOT store a simple editable number like:
--
--     credits = 500
--
-- Instead, Credits exist as transactions:
--
--     +100 reward
--      -25 purchase
--      +50 promotion
--
-- Current balance can therefore always be reconstructed from
-- the transaction history.
--

create table public.credit_ledger (

    id bigint generated always as identity primary key,

    user_id uuid not null
        references public.profiles(id)
        on delete cascade,

    -- Positive number = Credits added.
    -- Negative number = Credits spent.
    amount bigint not null
        check (amount <> 0),

    -- Examples:
    -- reward
    -- purchase
    -- refund
    -- promotion
    -- adjustment
    entry_type text not null,

    -- Which trusted system caused this entry.
    --
    -- Examples:
    -- sjw_core
    -- ceres
    -- ggg
    source text not null,

    -- Optional identifier supplied by the originating system.
    --
    -- Example:
    -- "weekly_challenge_2026_09_29"
    source_reference text,

    -- Optional globally unique identifier used to prevent
    -- the same reward/payment from accidentally being processed
    -- twice.
    idempotency_key text unique,

    description text,

    created_at timestamptz not null default now()
);


-- This index makes looking up one user's ledger history much
-- faster as the ledger eventually becomes large.

create index credit_ledger_user_created_idx
    on public.credit_ledger (
        user_id,
        created_at desc
    );


-- ------------------------------------------------------------
-- 5. CREDIT LEDGER SECURITY
-- ------------------------------------------------------------

alter table public.credit_ledger enable row level security;


-- Again: revoke first, then deliberately grant.

revoke all on table public.credit_ledger
    from anon, authenticated, service_role;


-- Ordinary authenticated users may READ their own ledger.
--
-- Notice that they are NOT granted INSERT, UPDATE, or DELETE.

grant select on table public.credit_ledger
    to authenticated;


-- Trusted SJW server-side code can read and ADD ledger entries.
--
-- Notice something important:
--
-- Even service_role is NOT being granted UPDATE or DELETE here.
--
-- Once a ledger entry exists, corrections should normally be
-- made with another compensating transaction rather than
-- rewriting history.

grant select, insert
    on table public.credit_ledger
    to service_role;


-- The identity column uses a PostgreSQL sequence internally.
-- Trusted backend code needs permission to use it when inserting.

grant usage, select
    on sequence public.credit_ledger_id_seq
    to service_role;


-- Users can see only THEIR OWN ledger entries.

create policy "Users can read own credit ledger"
    on public.credit_ledger
    for select
    to authenticated
    using (
        (select auth.uid()) = user_id
    );