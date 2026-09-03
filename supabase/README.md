# Supabase

Database schema, policies, and seed data for the RWA marketplace.

## Migrations

Files in `migrations/` are applied in filename order:

| Migration | Purpose |
| --- | --- |
| `20260903000001_initial_schema.sql` | Initial schema: core tables for the marketplace (profiles, asset categories, listings, and related tables). |
| `20260903000002_rls_policies.sql` | Row Level Security: enables RLS and defines the access policies for each table. |
| `20260903000003_views.sql` | Database views used by the frontend for read queries. |
| `20260903000004_storage.sql` | Storage buckets and storage access policies (listing images and documents). |
| `20260903000005_seed_asset_categories.sql` | Seeds `public.asset_categories` with the 16 asset classes from `src/constants.ts`, storing each per-class form schema as jsonb in the `fields` column. Idempotent: uses `on conflict (slug) do update`. |

## Applying migrations

Apply migrations either:

- via the Supabase MCP (`apply_migration`), or
- with the Supabase CLI: `supabase db push`
