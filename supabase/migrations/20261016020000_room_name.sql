-- Nom facultatif pour une room, modifiable par tous ses membres.

alter table public.rooms
  add column name text check (name is null or char_length(name) between 1 and 40);

create or replace function public.clean_room_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 40), '');
$$;

drop function public.create_room(text);

create or replace function public.create_room(p_name text, p_room_name text default null)
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
      insert into public.rooms (code, created_by, name)
      values (v_code, auth.uid(), public.clean_room_name(p_room_name))
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

create or replace function public.rename_room(p_room_id uuid, p_room_name text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  if not public.is_room_member(p_room_id) then
    raise exception 'Tu ne fais pas partie de cette room' using errcode = '42501';
  end if;
  update public.rooms set name = public.clean_room_name(p_room_name)
  where id = p_room_id
  returning * into v_room;
  return v_room;
end;
$$;

alter publication supabase_realtime add table public.rooms;
