-- Indexer ingestion cursor.
--
-- One row per (chain_id, contract_address) recording the last block whose
-- logs have been fetched and stored into chain_events. The indexer resumes
-- from last_block + 1 on the next cycle, so restarts and redeploys never
-- skip a block range.
--
-- Service-role only: RLS is enabled with no policies, matching chain_events.
-- NOTE: after applying this migration, regenerate src/types/database.ts so
-- the table appears in the generated types (src/lib/indexer/cursor.ts uses an
-- untyped client until then).

create table public.indexer_cursors (
  chain_id integer not null,
  contract_address text not null check (contract_address = lower(contract_address)),
  last_block bigint not null default 0 check (last_block >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  primary key (chain_id, contract_address)
);

alter table public.indexer_cursors enable row level security;

create trigger indexer_cursors_set_updated_at before update on public.indexer_cursors
for each row execute function public.set_updated_at();
