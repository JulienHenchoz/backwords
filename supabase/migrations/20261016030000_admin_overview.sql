-- Vue d'ensemble pour l'écran d'admin. Uniquement appelable avec la clé
-- service_role (depuis l'Edge Function `admin`, qui vérifie les identifiants).

create or replace function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with audio as (
    select
      split_part(name, '/', 1) as room_id,
      coalesce((metadata ->> 'size')::bigint, 0) as size
    from storage.objects
    where bucket_id = 'audio'
  ),
  audio_by_room as (
    select room_id, count(*) as files, sum(size) as bytes from audio group by room_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'storage', jsonb_build_object(
      'files', (select count(*) from audio),
      'bytes', (select coalesce(sum(size), 0) from audio)
    ),
    'totals', jsonb_build_object(
      'rooms', (select count(*) from public.rooms),
      'players', (select count(distinct user_id) from public.room_members),
      'words', (select count(*) from public.words),
      'messages', (select count(*) from public.room_messages)
    ),
    'rooms', coalesce((
      select jsonb_agg(row_to_json(r) order by r.last_activity_at desc)
      from (
        select
          room.id,
          room.code,
          room.name,
          room.created_at,
          room.last_activity_at,
          coalesce((
            select jsonb_agg(m.name order by m.joined_at)
            from public.room_members m where m.room_id = room.id
          ), '[]'::jsonb) as players,
          (select count(*) from public.words w where w.room_id = room.id) as words,
          (select count(*) from public.room_messages msg where msg.room_id = room.id) as messages,
          coalesce(a.files, 0) as audio_files,
          coalesce(a.bytes, 0) as audio_bytes
        from public.rooms room
        left join audio_by_room a on a.room_id = room.id::text
      ) r
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.admin_overview() from public, anon, authenticated;
grant execute on function public.admin_overview() to service_role;
