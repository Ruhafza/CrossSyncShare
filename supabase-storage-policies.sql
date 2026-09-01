-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query)
-- AFTER creating a bucket named 'netsync-files' and marking it PUBLIC
-- (Dashboard -> Storage -> New bucket -> toggle "Public bucket").
--
-- Same access model as the Firestore rules: the room code is this app's only
-- access control. Anyone with the anon key can upload to and delete from
-- this bucket — don't reuse it for anything sensitive, and don't paste
-- these policies onto a bucket that holds other data.

create policy "Allow anon uploads to netsync-files"
on storage.objects for insert
to anon
with check (bucket_id = 'netsync-files');

create policy "Allow anon deletes from netsync-files"
on storage.objects for delete
to anon
using (bucket_id = 'netsync-files');

-- No SELECT policy needed: the bucket's public-bucket flag serves reads
-- through the public URL endpoint directly, bypassing RLS.

-- Optional: cap individual uploads at 25MB (matches the old Firebase Storage
-- rule). Set this in the dashboard instead — Storage -> netsync-files ->
-- bucket settings -> "File size limit" — rather than in SQL.
