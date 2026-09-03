-- Fractionaire initial schema
-- Conventions: every table has uuid pk, created_at, updated_at (trigger maintained).
-- Wallet addresses stored lowercase, enforced by check constraints.
-- Money in USDC units as numeric(38,6). Fraction counts as bigint.

-- Enums ----------------------------------------------------------------------

create type user_type as enum ('retail', 'business');
create type kyc_status as enum ('pending', 'approved', 'rejected', 'reset');
create type asset_status as enum ('draft', 'minting', 'active', 'sold_out', 'delisted');
create type listing_kind as enum ('primary', 'secondary');
create type listing_status as enum ('active', 'filled', 'canceled');
create type order_status as enum ('created', 'awaiting_funds', 'funded', 'submitted', 'settled', 'failed', 'expired');
create type onramp_status as enum ('created', 'pending', 'completed', 'failed', 'canceled');
create type tx_type as enum ('mint', 'buy', 'sell_list', 'unlist', 'price_update', 'transfer', 'onramp');

-- updated_at trigger ---------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- users ----------------------------------------------------------------------

create table public.users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null check (wallet_address = lower(wallet_address)),
  type user_type not null,
  email text,
  phone text,
  name text,
  display_name text,
  legal_name text,
  logo_url text,
  is_verified boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create trigger users_set_updated_at before update on public.users
for each row execute function public.set_updated_at();

-- kyc_identities --------------------------------------------------------------

create table public.kyc_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  provider text not null default 'sumsub',
  external_id text,
  status kyc_status not null default 'pending',
  raw_payload jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index kyc_identities_user_id_idx on public.kyc_identities (user_id);
create unique index kyc_identities_provider_external_id_key
  on public.kyc_identities (provider, external_id)
  where external_id is not null;

create trigger kyc_identities_set_updated_at before update on public.kyc_identities
for each row execute function public.set_updated_at();

-- asset_categories -------------------------------------------------------------

create table public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  fields jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create trigger asset_categories_set_updated_at before update on public.asset_categories
for each row execute function public.set_updated_at();

-- assets -----------------------------------------------------------------------

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  nft_id bigint unique,
  internal_id text,
  business_id uuid not null references public.users (id),
  category_id uuid not null references public.asset_categories (id),
  status asset_status not null default 'draft',
  name text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  erc20_token_address text check (erc20_token_address = lower(erc20_token_address)),
  total_supply bigint check (total_supply is null or total_supply > 0),
  available_supply bigint check (available_supply is null or available_supply >= 0),
  valuation numeric(38,6),
  mint_price_per_fraction numeric(38,6),
  floor_price_per_fraction numeric(38,6),
  kyc_required boolean not null default false,
  mint_tx_hash text,
  chain_id integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint assets_active_requires_nft
    check (status not in ('active', 'sold_out') or nft_id is not null)
);

create index assets_business_id_idx on public.assets (business_id);
create index assets_category_id_idx on public.assets (category_id);
create index assets_status_idx on public.assets (status);
create unique index assets_erc20_token_address_key
  on public.assets (erc20_token_address)
  where erc20_token_address is not null;

create trigger assets_set_updated_at before update on public.assets
for each row execute function public.set_updated_at();

-- listings ---------------------------------------------------------------------

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id),
  lister_id uuid not null references public.users (id),
  kind listing_kind not null,
  quantity bigint not null check (quantity >= 0),
  original_quantity bigint not null check (original_quantity > 0),
  price_per_fraction numeric(38,6) not null check (price_per_fraction > 0),
  currency text not null default 'USDC',
  status listing_status not null default 'active',
  tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index listings_asset_status_price_idx
  on public.listings (asset_id, status, price_per_fraction);
create index listings_lister_id_idx on public.listings (lister_id);
create unique index listings_one_active_per_lister_price_key
  on public.listings (asset_id, lister_id, price_per_fraction)
  where status = 'active';

create trigger listings_set_updated_at before update on public.listings
for each row execute function public.set_updated_at();

-- holdings ---------------------------------------------------------------------

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  asset_id uuid not null references public.assets (id),
  quantity bigint not null default 0 check (quantity >= 0),
  locked_quantity bigint not null default 0 check (locked_quantity >= 0),
  average_entry_price numeric(38,6),
  last_synced_block bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (user_id, asset_id),
  constraint holdings_locked_lte_quantity check (locked_quantity <= quantity)
);

create index holdings_asset_id_idx on public.holdings (asset_id);

create trigger holdings_set_updated_at before update on public.holdings
for each row execute function public.set_updated_at();

-- orders -----------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.users (id),
  asset_id uuid not null references public.assets (id),
  quantity bigint not null check (quantity > 0),
  quoted_total numeric(38,6) not null,
  platform_fee numeric(38,6) not null,
  payment_method text,
  status order_status not null default 'created',
  fills jsonb,
  tx_hash text,
  failure_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index orders_buyer_status_idx on public.orders (buyer_id, status);
create index orders_asset_id_idx on public.orders (asset_id);
create index orders_tx_hash_idx on public.orders (tx_hash) where tx_hash is not null;

create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

-- onramp_sessions --------------------------------------------------------------

create table public.onramp_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id),
  user_id uuid not null references public.users (id),
  provider text not null,
  provider_session_id text unique,
  fiat_currency text,
  fiat_amount numeric(38,2),
  token_amount numeric(38,6),
  status onramp_status not null default 'created',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index onramp_sessions_user_id_idx on public.onramp_sessions (user_id);
create index onramp_sessions_order_id_idx on public.onramp_sessions (order_id);

create trigger onramp_sessions_set_updated_at before update on public.onramp_sessions
for each row execute function public.set_updated_at();

-- transactions -----------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  type tx_type not null,
  asset_id uuid references public.assets (id),
  order_id uuid references public.orders (id),
  listing_id uuid references public.listings (id),
  from_user_id uuid references public.users (id),
  to_user_id uuid references public.users (id),
  from_wallet text check (from_wallet is null or from_wallet = lower(from_wallet)),
  to_wallet text check (to_wallet is null or to_wallet = lower(to_wallet)),
  quantity bigint,
  price_per_fraction numeric(38,6),
  total numeric(38,6),
  fee numeric(38,6),
  fee_currency text default 'USDC',
  tx_hash text,
  block_number bigint,
  log_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (tx_hash, log_index)
);

create index transactions_asset_id_idx on public.transactions (asset_id);
create index transactions_order_id_idx on public.transactions (order_id);
create index transactions_listing_id_idx on public.transactions (listing_id);
create index transactions_from_user_id_idx on public.transactions (from_user_id);
create index transactions_to_user_id_idx on public.transactions (to_user_id);
create index transactions_from_wallet_idx on public.transactions (from_wallet);
create index transactions_to_wallet_idx on public.transactions (to_wallet);

create trigger transactions_set_updated_at before update on public.transactions
for each row execute function public.set_updated_at();

-- chain_events -----------------------------------------------------------------

create table public.chain_events (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  contract_address text check (contract_address is null or contract_address = lower(contract_address)),
  event_name text not null,
  tx_hash text not null,
  block_number bigint not null,
  log_index integer not null,
  args jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (chain_id, tx_hash, log_index)
);

create index chain_events_unprocessed_idx on public.chain_events (processed) where not processed;
create index chain_events_block_number_idx on public.chain_events (chain_id, block_number);

create trigger chain_events_set_updated_at before update on public.chain_events
for each row execute function public.set_updated_at();

-- audit_log --------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null,
  entity text,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index audit_log_actor_user_id_idx on public.audit_log (actor_user_id);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

create trigger audit_log_set_updated_at before update on public.audit_log
for each row execute function public.set_updated_at();
