-- Read model views.
--
-- v_marketplace runs as definer so anonymous visitors can see the business
-- display name and logo without a public policy on users. It exposes only
-- safe columns and only publicly visible assets.
-- v_portfolio and v_business_dashboard run as invoker, so the caller's RLS
-- decides which rows are visible.

create view public.v_marketplace
with (security_invoker = false) as
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
  b.id as business_id,
  coalesce(b.display_name, b.legal_name, b.name) as business_display_name,
  b.logo_url as business_logo_url,
  fp.floor_price_per_fraction,
  fp.listed_quantity,
  (a.status = 'active' and coalesce(fp.listed_quantity, 0) > 0) as is_purchasable
from public.assets a
join public.asset_categories c on c.id = a.category_id
join public.users b on b.id = a.business_id
left join lateral (
  select
    min(l.price_per_fraction) as floor_price_per_fraction,
    sum(l.quantity) as listed_quantity
  from public.listings l
  where l.asset_id = a.id and l.status = 'active'
) fp on true
where a.status in ('draft', 'minting', 'active', 'sold_out');

-- The definer view must not be writable and must stay limited to select.
revoke all on public.v_marketplace from anon, authenticated;
grant select on public.v_marketplace to anon, authenticated;

create view public.v_portfolio
with (security_invoker = true) as
select
  h.user_id,
  h.asset_id,
  h.quantity,
  h.locked_quantity,
  h.average_entry_price,
  h.updated_at as holding_updated_at,
  a.name as asset_name,
  a.status as asset_status,
  a.nft_id,
  a.metadata,
  a.erc20_token_address,
  a.total_supply,
  a.chain_id,
  a.kyc_required,
  ol.open_listing_quantity,
  ol.open_listing_count
from public.holdings h
join public.assets a on a.id = h.asset_id
left join lateral (
  select
    sum(l.quantity) as open_listing_quantity,
    count(*) as open_listing_count
  from public.listings l
  where l.asset_id = h.asset_id
    and l.lister_id = h.user_id
    and l.status = 'active'
) ol on true;

create view public.v_business_dashboard
with (security_invoker = true) as
select
  a.business_id,
  a.id as asset_id,
  a.name as asset_name,
  a.status,
  a.nft_id,
  a.total_supply,
  a.available_supply,
  a.mint_price_per_fraction,
  a.kyc_required,
  a.created_at,
  pl.primary_remaining,
  pl.primary_price,
  sales.units_sold,
  sales.gross_revenue,
  sales.buyer_count,
  sales.last_sale_at
from public.assets a
left join lateral (
  select
    sum(l.quantity) as primary_remaining,
    min(l.price_per_fraction) as primary_price
  from public.listings l
  where l.asset_id = a.id and l.kind = 'primary' and l.status = 'active'
) pl on true
left join lateral (
  select
    coalesce(sum(t.quantity), 0) as units_sold,
    coalesce(sum(t.total), 0) as gross_revenue,
    count(distinct t.to_user_id) as buyer_count,
    max(t.created_at) as last_sale_at
  from public.transactions t
  where t.asset_id = a.id
    and t.type = 'buy'
    and t.from_user_id = a.business_id
) sales on true;
