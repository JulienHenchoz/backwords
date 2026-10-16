-- Backwords : mode en ligne (rooms, mots, tentatives, notifications push).
--
-- Principes de sécurité :
--   * chaque joueur est un utilisateur Supabase anonyme (auth.uid()) ;
--   * on ne voit une room (et tout ce qu'elle contient) que si on en est membre ;
--   * la réponse d'un mot vit dans `word_secrets`, illisible via l'API : on ne
--     la récupère qu'au travers des fonctions `submit_guess`, `give_up` et
--     `get_answer`, qui vérifient que l'appelant y a droit ;
--   * l'enregistrement original (à l'endroit) n'est lisible que par l'auteur et
--     par ceux qui ont trouvé ou abandonné ; la version inversée et les
--     tentatives sont lisibles par tous les membres.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Mise à jour à chaque nouveau mot : sert à supprimer les rooms inactives
  -- depuis 30 jours.
  last_activity_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  notifications boolean not null default true,
  join_notified boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index room_members_user_idx on public.room_members (user_id);

create table public.words (
  -- Généré côté client : l'audio est uploadé avant la création de la ligne.
  id uuid primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Renseigné par la fonction `cleanup` une fois les fichiers audio supprimés.
  audio_deleted_at timestamptz,
  notified boolean not null default false
);

create index words_room_idx on public.words (room_id, created_at desc);
create index words_audio_expiry_idx on public.words (created_at) where audio_deleted_at is null;

create table public.word_secrets (
  word_id uuid primary key references public.words (id) on delete cascade,
  answer text not null,
  normalized text not null
);

create table public.word_results (
  word_id uuid not null references public.words (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  status text not null default 'playing' check (status in ('playing', 'solved', 'gave_up')),
  guesses integer not null default 0,
  updated_at timestamptz not null default now(),
  notified boolean not null default false,
  primary key (word_id, user_id)
);

create index word_results_room_idx on public.word_results (room_id);

create table public.attempts (
  word_id uuid not null references public.words (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  audio_path text not null,
  created_at timestamptz not null default now(),
  primary key (word_id, user_id)
);

create index attempts_room_idx on public.attempts (room_id);

create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

-- Comparaison tolérante : casse, accents, espaces et ponctuation ignorés.
create or replace function public.normalize_answer(p_text text)
returns text
language sql
stable
set search_path = ''
as $$
  select regexp_replace(lower(extensions.unaccent(coalesce(p_text, ''))), '[^a-z0-9]', '', 'g');
$$;

create or replace function public.clean_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if char_length(v_name) = 0 then
    raise exception 'Choisis un pseudo' using errcode = '22023';
  end if;
  return left(v_name, 20);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC : rooms
-- ---------------------------------------------------------------------------

create or replace function public.create_room(p_name text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;

  loop
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    begin
      insert into public.rooms (code, created_by)
      values (v_code, auth.uid())
      returning * into v_room;
      exit;
    exception when unique_violation then
      -- Code déjà pris : on retente.
    end;
  end loop;

  -- Le créateur n'est pas annoncé aux autres (il est seul).
  insert into public.room_members (room_id, user_id, name, join_notified)
  values (v_room.id, auth.uid(), public.clean_name(p_name), true);

  return v_room;
end;
$$;

create or replace function public.join_room(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_inserted boolean;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;

  select * into v_room from public.rooms where code = btrim(p_code);
  if not found then
    raise exception 'Aucune room avec ce code' using errcode = 'P0002';
  end if;

  insert into public.room_members (room_id, user_id, name)
  values (v_room.id, auth.uid(), public.clean_name(p_name))
  on conflict (room_id, user_id) do nothing;
  v_inserted := found;

  return jsonb_build_object('room', to_jsonb(v_room), 'joined', v_inserted);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC : mots
-- ---------------------------------------------------------------------------

create or replace function public.create_word(p_word_id uuid, p_room_id uuid, p_answer text)
returns public.words
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_word public.words;
  v_answer text := left(btrim(coalesce(p_answer, '')), 60);
  v_normalized text := public.normalize_answer(p_answer);
begin
  if not public.is_room_member(p_room_id) then
    raise exception 'Tu ne fais pas partie de cette room' using errcode = '42501';
  end if;
  if v_normalized = '' then
    raise exception 'Écris le mot que tu as enregistré' using errcode = '22023';
  end if;

  insert into public.words (id, room_id, author_id)
  values (p_word_id, p_room_id, auth.uid())
  returning * into v_word;

  insert into public.word_secrets (word_id, answer, normalized)
  values (v_word.id, v_answer, v_normalized);

  update public.rooms set last_activity_at = now() where id = p_room_id;

  return v_word;
end;
$$;

create or replace function public.submit_guess(p_word_id uuid, p_guess text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_word public.words;
  v_secret public.word_secrets;
  v_result public.word_results;
  v_correct boolean;
begin
  select * into v_word from public.words where id = p_word_id;
  if not found or not public.is_room_member(v_word.room_id) then
    raise exception 'Mot introuvable' using errcode = 'P0002';
  end if;
  if v_word.author_id = auth.uid() then
    raise exception 'Tu ne peux pas deviner ton propre mot' using errcode = '42501';
  end if;

  select * into v_secret from public.word_secrets where word_id = p_word_id;
  select * into v_result from public.word_results
  where word_id = p_word_id and user_id = auth.uid();

  if found and v_result.status <> 'playing' then
    return jsonb_build_object(
      'correct', v_result.status = 'solved',
      'status', v_result.status,
      'guesses', v_result.guesses,
      'answer', v_secret.answer
    );
  end if;

  if public.normalize_answer(p_guess) = '' then
    raise exception 'Écris ta réponse' using errcode = '22023';
  end if;

  v_correct := public.normalize_answer(p_guess) = v_secret.normalized;

  insert into public.word_results (word_id, user_id, room_id, status, guesses)
  values (p_word_id, auth.uid(), v_word.room_id, case when v_correct then 'solved' else 'playing' end, 1)
  on conflict (word_id, user_id) do update
    set status = excluded.status,
        guesses = public.word_results.guesses + 1,
        updated_at = now()
  returning * into v_result;

  return jsonb_build_object(
    'correct', v_correct,
    'status', v_result.status,
    'guesses', v_result.guesses,
    'answer', case when v_correct then v_secret.answer end
  );
end;
$$;

create or replace function public.give_up(p_word_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_word public.words;
  v_result public.word_results;
begin
  select * into v_word from public.words where id = p_word_id;
  if not found or not public.is_room_member(v_word.room_id) then
    raise exception 'Mot introuvable' using errcode = 'P0002';
  end if;
  if v_word.author_id = auth.uid() then
    raise exception 'C''est ton propre mot' using errcode = '42501';
  end if;

  insert into public.word_results (word_id, user_id, room_id, status)
  values (p_word_id, auth.uid(), v_word.room_id, 'gave_up')
  on conflict (word_id, user_id) do update
    set status = case when public.word_results.status = 'solved' then 'solved' else 'gave_up' end,
        updated_at = now()
  returning * into v_result;

  return jsonb_build_object(
    'correct', v_result.status = 'solved',
    'status', v_result.status,
    'guesses', v_result.guesses,
    'answer', (select answer from public.word_secrets where word_id = p_word_id)
  );
end;
$$;

-- L'auteur, ou quelqu'un qui a trouvé / abandonné, peut connaître la réponse.
create or replace function public.can_see_answer(p_word_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.words w
    where w.id = p_word_id
      and public.is_room_member(w.room_id)
      and (
        w.author_id = auth.uid()
        or exists (
          select 1 from public.word_results r
          where r.word_id = w.id and r.user_id = auth.uid() and r.status in ('solved', 'gave_up')
        )
      )
  );
$$;

create or replace function public.get_answer(p_word_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_see_answer(p_word_id) then
    return null;
  end if;
  return (select answer from public.word_secrets where word_id = p_word_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC : notifications push
-- ---------------------------------------------------------------------------

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  -- Un même navigateur peut changer d'utilisateur anonyme : l'endpoint est
  -- réattribué au joueur courant.
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

create or replace function public.set_room_notifications(p_room_id uuid, p_enabled boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.room_members set notifications = p_enabled
  where room_id = p_room_id and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Stockage audio
--
-- Bucket privé `audio`, chemins :
--   {room_id}/{word_id}/reversed.wav          mot inversé (tous les membres)
--   {room_id}/{word_id}/original.wav          mot à l'endroit (auteur + résolus)
--   {room_id}/{word_id}/attempts/{user}.wav   tentative d'un joueur (tous)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', false, 5242880, array['audio/wav'])
on conflict (id) do nothing;

create or replace function public.audio_path_parts(p_name text, out room_id uuid, out word_id uuid, out kind text, out user_id uuid)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
begin
  begin
    room_id := v_parts[1]::uuid;
    word_id := v_parts[2]::uuid;
    if array_length(v_parts, 1) = 3 and v_parts[3] in ('reversed.wav', 'original.wav') then
      kind := split_part(v_parts[3], '.', 1);
    elsif array_length(v_parts, 1) = 4 and v_parts[3] = 'attempts' and v_parts[4] like '%.wav' then
      kind := 'attempt';
      user_id := left(v_parts[4], -4)::uuid;
    end if;
  exception when others then
    kind := null;
  end;
end;
$$;

create or replace function public.can_read_audio(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path record := public.audio_path_parts(p_name);
begin
  if v_path.kind is null or not public.is_room_member(v_path.room_id) then
    return false;
  end if;
  if v_path.kind = 'original' then
    return public.can_see_answer(v_path.word_id);
  end if;
  return true;
end;
$$;

create or replace function public.can_upload_audio(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path record := public.audio_path_parts(p_name);
  v_word public.words;
begin
  if v_path.kind is null or not public.is_room_member(v_path.room_id) then
    return false;
  end if;

  select * into v_word from public.words where id = v_path.word_id;

  if v_path.kind = 'attempt' then
    return v_path.user_id = auth.uid()
      and found
      and v_word.room_id = v_path.room_id
      and v_word.audio_deleted_at is null
      and v_word.created_at > now() - interval '7 days';
  end if;

  -- original / reversed : uploadés avant la création du mot.
  return not found;
end;
$$;

create policy "audio: lecture par les membres"
on storage.objects for select to authenticated
using (bucket_id = 'audio' and public.can_read_audio(name));

create policy "audio: upload par les membres"
on storage.objects for insert to authenticated
with check (bucket_id = 'audio' and public.can_upload_audio(name));

create policy "audio: remplacement de ses propres fichiers"
on storage.objects for update to authenticated
using (bucket_id = 'audio' and owner_id = auth.uid()::text)
with check (bucket_id = 'audio' and public.can_upload_audio(name));

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.words enable row level security;
alter table public.word_secrets enable row level security;
alter table public.word_results enable row level security;
alter table public.attempts enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "rooms: lecture par les membres" on public.rooms
for select to authenticated using (public.is_room_member(id));

create policy "room_members: lecture par les membres" on public.room_members
for select to authenticated using (public.is_room_member(room_id));

create policy "room_members: quitter une room" on public.room_members
for delete to authenticated using (user_id = auth.uid());

create policy "words: lecture par les membres" on public.words
for select to authenticated using (public.is_room_member(room_id));

-- word_secrets : aucune policy, donc inaccessible via l'API.

create policy "word_results: lecture par les membres" on public.word_results
for select to authenticated using (public.is_room_member(room_id));

create policy "attempts: lecture par les membres" on public.attempts
for select to authenticated using (public.is_room_member(room_id));

create policy "attempts: ajout de sa tentative" on public.attempts
for insert to authenticated
with check (
  user_id = auth.uid()
  and public.is_room_member(room_id)
  and exists (select 1 from public.words w where w.id = word_id and w.room_id = attempts.room_id)
  and audio_path = room_id::text || '/' || word_id::text || '/attempts/' || user_id::text || '.wav'
);

create policy "attempts: remplacement de sa tentative" on public.attempts
for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and audio_path = room_id::text || '/' || word_id::text || '/attempts/' || user_id::text || '.wav'
);

create policy "push_subscriptions: lecture des siennes" on public.push_subscriptions
for select to authenticated using (user_id = auth.uid());

-- Les écritures directes passent par les fonctions ci-dessus.
revoke insert, update, delete on public.rooms, public.words, public.word_secrets, public.word_results,
  public.push_subscriptions from anon, authenticated;
revoke insert, update on public.room_members from anon, authenticated;
revoke all on public.word_secrets from anon, authenticated;

revoke execute on function public.audio_path_parts(text) from public, anon;
revoke execute on function public.can_upload_audio(text) from public, anon;
revoke execute on function public.can_read_audio(text) from public, anon;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.room_members, public.words, public.word_results, public.attempts;
