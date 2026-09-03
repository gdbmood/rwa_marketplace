-- Storage buckets for asset media.
--
-- Uploads happen only through server actions (service role). Public read is
-- intentional: asset images and documents are shown on public asset pages.

insert into storage.buckets (id, name, public)
values
  ('asset-images', 'asset-images', true),
  ('asset-documents', 'asset-documents', true)
on conflict (id) do nothing;

-- No storage.objects policies for anon or authenticated: public buckets serve
-- reads through the public URL path, and writes require the service role.
