-- ============================================================
-- SJW CORE - CREDIT BALANCE FUNCTION
-- ============================================================

create or replace function public.get_my_credit_balance()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$

    select coalesce(
        sum(amount),
        0
    )::bigint

    from public.credit_ledger

    where user_id = (
        select auth.uid()
    );

$$;


-- PostgreSQL functions can otherwise inherit broad EXECUTE
-- privileges, so explicitly restrict this one.

revoke execute
    on function public.get_my_credit_balance()
    from public, anon;


grant execute
    on function public.get_my_credit_balance()
    to authenticated;