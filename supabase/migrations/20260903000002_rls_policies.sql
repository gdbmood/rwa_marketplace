-- Row level security.
--
-- Access model:
--   * The browser client uses the anon key and is READ ONLY. It can read public
--     marketplace data. For private rows it must present a short lived RLS JWT
--     minted by the server after thirdweb login (HS256, project JWT secret,
--     sub = users.id, role = 'authenticated', wallet = wallet_address).
--   * ALL writes go through Next.js server actions using the service role key,
--     which bypasses RLS. There are intentionally NO insert, update or delete
--     policies for anon or authenticated on any table.

alter table public.users enable row level security;
alter table public.kyc_identities enable row level security;
alter table public.asset_categories enable row level security;
alter table public.assets enable row level security;
alter table public.listings enable row level security;
alter table public.holdings enable row level security;
alter table public.orders enable row level security;
alter table public.onramp_sessions enable row level security;
alter table public.transactions enable row level security;
alter table public.chain_events enable row level security;
alter table public.audit_log enable row level security;

-- Public catalogue -------------------------------------------------------------

create policy "categories are public"
  on public.asset_categories for select
  to anon, authenticated
  using (is_active);

-- Draft and minting assets are publicly visible as "Coming soon" cards.
-- Delisted assets are hidden from the public.
create policy "listed assets are public"
  on public.assets for select
  to anon, authenticated
  using (status in ('draft', 'minting', 'active', 'sold_out'));

create policy "businesses read own assets in any status"
  on public.assets for select
  to authenticated
  using (business_id = (select auth.uid()));

create policy "active listings are public"
  on public.listings for select
  to anon, authenticated
  using (status = 'active');

create policy "listers read own listings in any status"
  on public.listings for select
  to authenticated
  using (lister_id = (select auth.uid()));

-- Private, own row only --------------------------------------------------------

create policy "users read own row"
  on public.users for select
  to authenticated
  using (id = (select auth.uid()));

create policy "users read own kyc"
  on public.kyc_identities for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users read own holdings"
  on public.holdings for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "buyers read own orders"
  on public.orders for select
  to authenticated
  using (buyer_id = (select auth.uid()));

create policy "users read own onramp sessions"
  on public.onramp_sessions for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users read own transactions"
  on public.transactions for select
  to authenticated
  using (
    from_user_id = (select auth.uid())
    or to_user_id = (select auth.uid())
  );

-- chain_events and audit_log: no client policies at all (service role only).
