-- Storage bucket for customer (team captain) photos.
--
-- This is the app's FIRST use of Supabase Storage. The bucket is public: the
-- Customers screen renders these images directly in a paginated table, and
-- minting a signed URL per row on every page render would cost an async round
-- trip per customer for photos that carry no secrets.
--
-- RLS caveat: the README records that this project deliberately uses no RLS —
-- access is granted to `anon` via plain table GRANTs. Storage does not work
-- that way: authorization for storage.objects is expressed ONLY as RLS
-- policies, so the policies below are a necessary, scoped exception rather than
-- a change of direction. They grant `anon` exactly what the anon key already
-- has on every application table (full read/write), confined to this one
-- bucket. See docs/brain/features/2026-07-20-captain-images.md.
--
-- file_size_limit is 5 MiB, matching MAX_UPLOAD_BYTES in
-- src/lib/customerImage.js — the client also downscales to 512px before
-- uploading, so real objects land far below the cap. This is a server-side
-- backstop for a client-side check.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-images',
  'customer-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Policies are dropped first so this file stays re-runnable (older Postgres
-- versions in the Supabase image lack `create policy if not exists`).
drop policy if exists "customer images are publicly readable" on storage.objects;
drop policy if exists "anon can upload customer images"       on storage.objects;
drop policy if exists "anon can replace customer images"      on storage.objects;
drop policy if exists "anon can delete customer images"       on storage.objects;

create policy "customer images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'customer-images');

create policy "anon can upload customer images"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'customer-images');

create policy "anon can replace customer images"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'customer-images')
  with check (bucket_id = 'customer-images');

create policy "anon can delete customer images"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'customer-images');
