-- Petit chat texte par room.

create table public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index room_messages_room_idx on public.room_messages (room_id, created_at desc);

alter table public.room_messages enable row level security;

create policy "room_messages: lecture par les membres" on public.room_messages
for select to authenticated using (public.is_room_member(room_id));

create policy "room_messages: envoi par les membres" on public.room_messages
for insert to authenticated
with check (user_id = auth.uid() and public.is_room_member(room_id));

revoke update, delete on public.room_messages from anon, authenticated;

alter publication supabase_realtime add table public.room_messages;
