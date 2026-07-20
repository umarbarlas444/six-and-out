# Captain images on customers

**Date:** 2026-07-20
**Touches:** `src/pages/Customers.jsx`, `src/lib/customerImage.js`, `src/components/Avatar.jsx`, `supabase/migrations/20260720120000_customer_avatar.sql`, `supabase/migrations/20260720120100_customer_images_bucket.sql`

## Why

Customer rows were text-only, so the Customers screen gave the operator no way to
recognise a team at a glance. A photo of the team captain does that. The photo is
optional — most customers won't have one, and nothing depends on it.

Scoped deliberately to the Customers page. Creating a customer inline from
[[2026-07-13-customer-records|the booking form flow]] still uses the same four
fields it always did: that path exists to capture a booking quickly, and a file
picker in the middle of it would be friction for a field nobody fills in there.
`customers.avatar_url` is nullable, so those rows simply fall back to initials.

## Decisions

**Supabase Storage, not a server folder.** The original idea was to drop files in
a folder on the Hostinger box and store the link. There's no server to do that
with: the app is a static SPA FTP'd to Hostinger by CI, and the browser has no
write path to that filesystem. Storage gives the same "folder plus URL" shape
without inventing a backend.

**Public bucket.** The Customers table renders a page of these images at once.
A private bucket would mean minting a signed URL per row on every render, and
expiring URLs, in exchange for protecting photos that carry nothing sensitive.

**Storage RLS is a deliberate exception.** This project otherwise uses no RLS —
`anon` gets plain table GRANTs (see `20260714120000_anon_table_grants.sql`).
Storage has no equivalent: authorization on `storage.objects` is expressed only
as policies. The four policies added are scoped to `bucket_id =
'customer-images'` and grant `anon` exactly what the anon key already has
everywhere else. Not a change of direction; the only mechanism available.

**5MB cap plus a 512px downscale.** Supabase's platform ceiling is 50MB, which is
meaningless for an avatar — a raw phone photo is 3-8MB and there could be a
screenful of them. The client rejects anything over 5MB, then canvas-downscales
to 512px on the long edge and re-encodes as WebP, so stored objects land around
30-100KB. The bucket's `file_size_limit` repeats the 5MB cap as a server-side
backstop.

**Timestamped filenames.** `<customerId>-<epoch>.webp` rather than a stable
`<customerId>.webp`. Overwriting in place would leave the CDN serving the old
image after a replacement.

## Gotchas

- `customer_directory` enumerates its columns explicitly, so adding a column to
  `customers` is invisible to the Customers screen until the view is re-declared.
  The migration does both. Any future column needs the same treatment.
- `Avatar` falls back to initials on image load error, not just on a missing URL —
  an `avatar_url` can outlive its object if the bucket is cleaned up by hand.
- **COEP.** Production serves the app with `Cross-Origin-Embedder-Policy:
  require-corp` (not set anywhere in this repo — it comes from the Hostinger
  side). Supabase Storage returns `access-control-allow-origin: *` but no
  `Cross-Origin-Resource-Policy` header, so avatars loaded as ordinary no-cors
  images are blocked with
  `ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep`
  despite the request returning 200 — it worked locally and only broke once
  live. `Avatar.jsx` sets `crossOrigin="anonymous"` so the image is fetched in
  CORS mode, which the wildcard ACAO satisfies. Any future cross-origin image
  needs the same attribute.
- Deleting a customer is a soft delete and does **not** remove their image from
  the bucket. Orphans are cheap; a hard cleanup job can come later if it matters.
- `Avatar.jsx` is now the single implementation — `Leaderboard.jsx` and
  `TeamSeriesModal.jsx` had their local copies deleted and use it, so a photo
  shows anywhere initials used to. `TeamSeriesModal` keeps a thin `Crest`
  wrapper purely for its smaller crest-sized initials.
- Leaderboard teams are identified by the name **snapshot** on the booking, not
  by a join to `customers`, so their photos can't come along for the ride. They
  are fetched separately by `getCustomerAvatars(ids)` in `db.js` and attached
  after the fact. Anything else that renders a team from booking snapshots needs
  the same extra lookup.
- `computeLeaderboard` in `lib/leaderboard.js` is deliberately import-free and
  shared byte-for-byte with the public Edge Function, so photos are attached in
  `db.js` *around* it rather than inside. The public leaderboard JSON therefore
  has no avatars — intentional, and the place to change if it ever should.
