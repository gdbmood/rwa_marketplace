-- Advisor fixes: resolve multiple_permissive_policies WARNs on assets and listings.
--
-- Both tables had two permissive SELECT policies applying to the authenticated
-- role (a public visibility policy for anon + authenticated, plus an owner
-- policy for authenticated only). Postgres evaluates every permissive policy on
-- each query, so we consolidate to exactly one SELECT policy per role per table:
--   anon           keeps the public visibility condition only
--   authenticated  gets the public condition OR the owner condition in one policy
-- Semantics are unchanged; only the policy layout differs.

-- assets ---------------------------------------------------------------------

drop policy if exists "listed assets are public" on public.assets;
drop policy if exists "businesses read own assets in any status" on public.assets;

create policy "anon read listed assets"
  on public.assets
  for select
  to anon
  using (
    status = any (array['draft'::asset_status, 'minting'::asset_status, 'active'::asset_status, 'sold_out'::asset_status])
  );

create policy "authenticated read listed or own assets"
  on public.assets
  for select
  to authenticated
  using (
    status = any (array['draft'::asset_status, 'minting'::asset_status, 'active'::asset_status, 'sold_out'::asset_status])
    or business_id = (select auth.uid())
  );

-- listings -------------------------------------------------------------------

drop policy if exists "active listings are public" on public.listings;
drop policy if exists "listers read own listings in any status" on public.listings;

create policy "anon read active listings"
  on public.listings
  for select
  to anon
  using (
    status = 'active'::listing_status
  );

create policy "authenticated read active or own listings"
  on public.listings
  for select
  to authenticated
  using (
    status = 'active'::listing_status
    or lister_id = (select auth.uid())
  );
