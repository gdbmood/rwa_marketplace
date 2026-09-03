-- Hardening pass after the first advisor run.
--
-- 1. The trigger helper must not be callable through the REST RPC surface.
-- 2. v_marketplace was a security definer view so anonymous visitors could see
--    business display names. Definer views are flagged by the Supabase linter,
--    so instead we keep a dedicated business_profiles table containing ONLY the
--    safe public columns. The server layer writes it in the same transaction
--    that writes users. v_marketplace becomes a security invoker view.

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create table public.business_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  display_name text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create trigger business_profiles_set_updated_at before update on public.business_profiles
for each row execute function public.set_updated_at();

alter table public.business_profiles enable row level security;

create policy "business profiles are public"
  on public.business_profiles for select
  to anon, authenticated
  using (true);

drop view public.v_marketplace;

create view public.v_marketplace
with (security_invoker = true) as
select
  a.id as asset_id,
  a.nft_id,
  a.status,
  a.name,
  a.description,
  a.metadata,
  a.erc20_token_address,
  a.total_supply,
  a.available_supply,
  a.valuation,
  a.mint_price_per_fraction,
  a.kyc_required,
  a.chain_id,
  a.created_at,
  c.id as category_id,
  c.name as category_name,
  c.slug as category_slug,
  a.business_id,
  bp.display_name as business_display_name,
  bp.logo_url as business_logo_url,
  fp.floor_price_per_fraction,
  fp.listed_quantity,
  (a.status = 'active' and coalesce(fp.listed_quantity, 0) > 0) as is_purchasable
from public.assets a
join public.asset_categories c on c.id = a.category_id
left join public.business_profiles bp on bp.user_id = a.business_id
left join lateral (
  select
    min(l.price_per_fraction) as floor_price_per_fraction,
    sum(l.quantity) as listed_quantity
  from public.listings l
  where l.asset_id = a.id and l.status = 'active'
) fp on true
where a.status in ('draft', 'minting', 'active', 'sold_out');
