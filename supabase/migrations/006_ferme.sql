-- ============================================================
-- 006 : la ferme devient l'unité permanente
-- ============================================================
-- Avant : jardins, planches et équipe étaient rattachés à UNE saison.
-- Une planche 2027 ne pouvait pas savoir qu'elle était encore occupée par
-- des renoncules semées à l'automne 2026, et chaque nouvelle saison
-- obligeait à tout recréer et à réinviter l'équipe.
--
-- Après :
--  * farms + farm_members : la ferme et son équipe, permanentes ;
--  * seasons.farm_id, gardens.farm_id : saisons et jardins appartiennent
--    à la ferme. Une plantation garde sa saison (CA, bilan) mais
--    l'occupation d'une planche se lit par dates, toutes saisons confondues ;
--  * team_members reste alimentée automatiquement (une ligne par membre de
--    la ferme et par saison) pour que l'ancienne interface fonctionne
--    pendant la transition. La source de vérité est farm_members ;
--  * duplicate_season_plan() : reprendre un plan l'année suivante.
-- ============================================================

-- ------------------------------------------------------------
-- A. Tables
-- ------------------------------------------------------------
create table public.farms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.farm_members (
  id        uuid primary key default gen_random_uuid(),
  farm_id   uuid not null references public.farms(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  unique (farm_id, user_id)
);
create index farm_members_user_idx on public.farm_members(user_id);

alter table public.seasons add column farm_id uuid references public.farms(id) on delete cascade;
alter table public.gardens add column farm_id uuid references public.farms(id) on delete cascade;

-- ------------------------------------------------------------
-- B. Reprise de l'existant : une ferme par propriétaire de saison
-- ------------------------------------------------------------
do $$
declare r record; v_farm uuid;
begin
  for r in
    select distinct on (s.user_id) s.user_id, coalesce(nullif(trim(p.farm_name), ''), 'Ma ferme') as nom
    from public.seasons s join public.profiles p on p.id = s.user_id
    order by s.user_id
  loop
    insert into public.farms (name, created_by) values (r.nom, r.user_id) returning id into v_farm;
    update public.seasons set farm_id = v_farm where user_id = r.user_id;
  end loop;
end $$;

-- Équipe de la ferme : tout membre d'une de ses saisons, owner l'emportant
insert into public.farm_members (farm_id, user_id, role, joined_at)
select s.farm_id, tm.user_id,
       case when bool_or(tm.role = 'owner') then 'owner' else 'member' end,
       min(tm.joined_at)
from public.team_members tm join public.seasons s on s.id = tm.season_id
group by s.farm_id, tm.user_id
on conflict (farm_id, user_id) do update set role = excluded.role;

update public.gardens g set farm_id = s.farm_id from public.seasons s where s.id = g.season_id;

alter table public.seasons alter column farm_id set not null;
alter table public.gardens alter column farm_id set not null;
alter table public.gardens alter column season_id drop not null;
create index seasons_farm_idx on public.seasons(farm_id);
create index gardens_farm_idx on public.gardens(farm_id);

-- ------------------------------------------------------------
-- C. Fonctions d'appartenance, désormais au niveau ferme
-- ------------------------------------------------------------
create or replace function public.my_farm_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select farm_id from public.farm_members where user_id = auth.uid();
$$;

create or replace function public.is_farm_owner(p_farm_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.farm_members
                where farm_id = p_farm_id and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.my_season_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select s.id from public.seasons s
  join public.farm_members fm on fm.farm_id = s.farm_id
  where fm.user_id = auth.uid();
$$;

create or replace function public.is_team_member(p_season_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.seasons s
                join public.farm_members fm on fm.farm_id = s.farm_id
                where s.id = p_season_id and fm.user_id = auth.uid());
$$;

create or replace function public.is_team_owner(p_season_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.seasons s
                join public.farm_members fm on fm.farm_id = s.farm_id
                where s.id = p_season_id and fm.user_id = auth.uid() and fm.role = 'owner');
$$;

create or replace function public.my_teammate_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select auth.uid()
  union
  select fm2.user_id from public.farm_members fm1
  join public.farm_members fm2 on fm2.farm_id = fm1.farm_id
  where fm1.user_id = auth.uid();
$$;

-- Équipe d'une ferme, avec emails (profiles n'est lisible que par soi)
create or replace function public.farm_team(p_farm_id uuid)
returns table (id uuid, farm_id uuid, user_id uuid, role text, joined_at timestamptz, email text, owner_name text)
language sql stable security definer set search_path = '' as $$
  select fm.id, fm.farm_id, fm.user_id, fm.role, fm.joined_at, p.email, p.owner_name
  from public.farm_members fm join public.profiles p on p.id = fm.user_id
  where fm.farm_id = p_farm_id
    and exists (select 1 from public.farm_members me where me.farm_id = p_farm_id and me.user_id = auth.uid())
  order by fm.joined_at;
$$;

-- Compatibilité : même signature qu'en 004, renvoie l'équipe de la ferme
create or replace function public.season_team(p_season_id uuid)
returns table (id uuid, season_id uuid, user_id uuid, role text, joined_at timestamptz, email text, owner_name text)
language sql stable security definer set search_path = '' as $$
  select tm.id, tm.season_id, tm.user_id, tm.role, tm.joined_at, p.email, p.owner_name
  from public.team_members tm join public.profiles p on p.id = tm.user_id
  where tm.season_id = p_season_id and public.is_team_member(p_season_id)
  order by tm.joined_at;
$$;

-- ------------------------------------------------------------
-- D. Synchronisation farm_members -> team_members (ancienne interface)
-- ------------------------------------------------------------
create or replace function public.farm_member_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.team_members (season_id, user_id, role)
    select s.id, new.user_id, new.role from public.seasons s where s.farm_id = new.farm_id
    on conflict (season_id, user_id) do update set role = excluded.role;
    return new;
  elsif tg_op = 'UPDATE' then
    update public.team_members tm set role = new.role
    from public.seasons s where s.id = tm.season_id and s.farm_id = new.farm_id and tm.user_id = new.user_id;
    return new;
  else
    delete from public.team_members tm using public.seasons s
    where s.id = tm.season_id and s.farm_id = old.farm_id and tm.user_id = old.user_id;
    return old;
  end if;
end; $$;

create trigger trg_farm_member_sync after insert or update or delete on public.farm_members
  for each row execute function public.farm_member_sync();

-- Retirer quelqu'un depuis l'ancienne interface (team_members) le retire de
-- la ferme ; jamais un owner. Ignoré quand la ligne part en cascade de la
-- suppression d'une saison : supprimer une saison ne doit exclure personne.
create or replace function public.team_member_unlink()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role <> 'owner'
     and exists (select 1 from public.seasons where id = old.season_id) then
    delete from public.farm_members fm using public.seasons s
    where s.id = old.season_id and fm.farm_id = s.farm_id and fm.user_id = old.user_id and fm.role <> 'owner';
  end if;
  return old;
end; $$;

create trigger trg_team_member_unlink after delete on public.team_members
  for each row execute function public.team_member_unlink();

-- Nouvelle saison : rattachée à la ferme de son créateur (créée au besoin),
-- et toute l'équipe de la ferme y a accès d'office.
create or replace function public.season_set_farm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.farm_id is null then
    select fm.farm_id into new.farm_id from public.farm_members fm
    where fm.user_id = new.user_id and fm.role = 'owner'
    order by fm.joined_at limit 1;
    if new.farm_id is null then
      insert into public.farms (name, created_by)
      select coalesce(nullif(trim(p.farm_name), ''), 'Ma ferme'), new.user_id
      from public.profiles p where p.id = new.user_id
      returning id into new.farm_id;  -- owner ajouté par trg_farm_add_creator
    end if;
  elsif not exists (select 1 from public.farm_members
                    where farm_id = new.farm_id and user_id = new.user_id and role = 'owner') then
    raise exception 'Seul un propriétaire de la ferme peut y créer une saison';
  end if;
  return new;
end; $$;

create trigger trg_season_set_farm before insert on public.seasons
  for each row execute function public.season_set_farm();

-- Remplace add_season_owner (004) : toute l'équipe de la ferme, pas seulement le créateur
create or replace function public.add_season_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_members (season_id, user_id, role)
  select new.id, fm.user_id, fm.role from public.farm_members fm where fm.farm_id = new.farm_id
  on conflict (season_id, user_id) do nothing;
  return new;
end; $$;

-- Ancienne interface : un jardin créé avec season_id seul hérite de la ferme
create or replace function public.garden_set_farm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.farm_id is null and new.season_id is not null then
    select s.farm_id into new.farm_id from public.seasons s where s.id = new.season_id;
  end if;
  return new;
end; $$;

create trigger trg_garden_set_farm before insert on public.gardens
  for each row execute function public.garden_set_farm();

-- Une ferme créée directement : son créateur en devient owner
create or replace function public.farm_add_creator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.farm_members (farm_id, user_id, role) values (new.id, new.created_by, 'owner')
  on conflict (farm_id, user_id) do nothing;
  return new;
end; $$;

create trigger trg_farm_add_creator after insert on public.farms
  for each row execute function public.farm_add_creator();

-- ------------------------------------------------------------
-- E. Invitations : on rejoint la ferme, donc toutes ses saisons
-- ------------------------------------------------------------
create or replace function public.join_season_by_token(p_token uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare v_season_id uuid; v_season_name text; v_farm uuid;
begin
  if auth.uid() is null then return json_build_object('error', 'Connexion requise'); end if;
  select id, name, farm_id into v_season_id, v_season_name, v_farm
  from public.seasons where invite_token = p_token and invite_enabled = true;
  if v_season_id is null then return json_build_object('error', 'Lien invalide ou désactivé'); end if;
  if exists (select 1 from public.farm_members where farm_id = v_farm and user_id = auth.uid()) then
    return json_build_object('ok', true, 'season_id', v_season_id, 'season_name', v_season_name, 'message', 'Déjà membre');
  end if;
  insert into public.farm_members (farm_id, user_id, role) values (v_farm, auth.uid(), 'member');
  return json_build_object('ok', true, 'season_id', v_season_id, 'season_name', v_season_name);
end; $$;

create or replace function public.invite_by_email(p_season_id uuid, p_email text)
returns json language plpgsql security definer set search_path = '' as $$
declare v_target uuid; v_email text := lower(trim(p_email)); v_farm uuid;
begin
  if not public.is_team_owner(p_season_id) then
    return json_build_object('error', 'Seul le propriétaire peut inviter');
  end if;
  select farm_id into v_farm from public.seasons where id = p_season_id;
  select id into v_target from auth.users where lower(email) = v_email;
  if v_target is not null then
    if exists (select 1 from public.farm_members where farm_id = v_farm and user_id = v_target) then
      return json_build_object('status', 'already_member', 'message', 'Déjà membre de l''équipe');
    end if;
    insert into public.farm_members (farm_id, user_id, role) values (v_farm, v_target, 'member');
    return json_build_object('status', 'added', 'message', 'Membre ajouté directement');
  end if;
  insert into public.pending_invites (season_id, email, invited_by)
  values (p_season_id, v_email, auth.uid()) on conflict (season_id, email) do nothing;
  return json_build_object('status', 'pending', 'message', 'Invitation enregistrée, elle sera activée à l''inscription');
end; $$;

create or replace function public.convert_pending_invites()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.email is not null then
    for r in select pi.id, s.farm_id from public.pending_invites pi
             join public.seasons s on s.id = pi.season_id
             where pi.email = lower(new.email) loop
      insert into public.farm_members (farm_id, user_id, role) values (r.farm_id, new.id, 'member')
      on conflict (farm_id, user_id) do nothing;
      delete from public.pending_invites where id = r.id;
    end loop;
  end if;
  return new;
end; $$;

-- ------------------------------------------------------------
-- F. Reprendre un plan de culture l'année suivante
-- ------------------------------------------------------------
create or replace function public.duplicate_season_plan(
  p_source_season uuid, p_name text, p_year int, p_shift_years int default 1)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_src public.seasons%rowtype; v_new uuid;
begin
  if not public.is_team_owner(p_source_season) then
    raise exception 'Seul le propriétaire peut dupliquer un plan';
  end if;
  select * into v_src from public.seasons where id = p_source_season;
  insert into public.seasons (user_id, farm_id, name, year, revenue_goal, is_active)
  values (auth.uid(), v_src.farm_id, p_name, p_year, v_src.revenue_goal, false)
  returning id into v_new;
  -- Les dates dérivées (plantation, récolte, fin, volumes) sont recalculées
  -- par trg_calc_planting à partir de la nouvelle date de semis.
  insert into public.plantings (planche_id, culture_id, season_id, surface_m2, date_semis,
    jours_cellule_override, jours_champ_override, jours_recolte_override,
    rendement_override, prix_override, notes)
  select planche_id, culture_id, v_new, surface_m2, (date_semis + make_interval(years => p_shift_years))::date,
    jours_cellule_override, jours_champ_override, jours_recolte_override,
    rendement_override, prix_override, notes
  from public.plantings where season_id = p_source_season;
  return v_new;
end; $$;

-- ------------------------------------------------------------
-- G. Vue des plantations : ferme exposée pour lire par dates
-- ------------------------------------------------------------
create or replace view public.plantings_full with (security_invoker = true) as
select p.id, p.planche_id, p.culture_id, p.season_id, p.surface_m2, p.date_semis,
  (p.date_semis + coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0)) as date_plantation,
  ((p.date_semis + coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0)) + coalesce(p.jours_champ_override, c.jours_champ)) as date_recolte,
  (((p.date_semis + coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0)) + coalesce(p.jours_champ_override, c.jours_champ)) + coalesce(p.jours_recolte_override, c.jours_recolte, 21)) as date_fin,
  p.plants_count, p.tiges_estimees, p.revenu_estime, p.graines_necessaires,
  p.jours_cellule_override, p.jours_champ_override, p.jours_recolte_override,
  p.rendement_override, p.prix_override,
  p.surface_m2 as planting_m2, p.notes as planting_notes,
  c.name as culture_name, c.type as culture_type,
  coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0) as jours_cellule,
  coalesce(p.jours_champ_override, c.jours_champ) as jours_champ,
  coalesce(p.jours_recolte_override, c.jours_recolte, 21) as jours_recolte,
  coalesce(p.rendement_override, c.rendement_plant) as rendement,
  coalesce(p.prix_override, c.prix_tige) as prix_tige,
  c.temp_germination, c.pincer, c.filet, c.couvre_sol, c.semis_direct,
  c.espacement_cm, c.rangs_par_planche, c.graines_par_plant,
  pl.name as planche_name, pl.surface_m2 as planche_m2,
  g.name as garden_name, g.id as garden_id, g.surface_m2 as garden_m2,
  s.user_id,
  g.farm_id, s.name as season_name, s.year as season_year
from public.plantings p
join public.culture_catalog c on c.id = p.culture_id
join public.planches pl on pl.id = p.planche_id
join public.gardens g on g.id = pl.garden_id
join public.seasons s on s.id = p.season_id;

-- ------------------------------------------------------------
-- H. RLS
-- ------------------------------------------------------------
alter table public.farms enable row level security;
alter table public.farm_members enable row level security;

-- created_by : l'INSERT ... RETURNING relit la ferme avant que
-- my_farm_ids() (stable) ne voie l'owner ajouté par trigger.
create policy "fermes : lecture équipe" on public.farms for select to authenticated
  using (created_by = auth.uid() or id in (select public.my_farm_ids()));
create policy "fermes : création" on public.farms for insert to authenticated
  with check (created_by = auth.uid());
create policy "fermes : modification owner" on public.farms for update to authenticated
  using (public.is_farm_owner(id)) with check (public.is_farm_owner(id));

create policy "équipe ferme : lecture" on public.farm_members for select to authenticated
  using (farm_id in (select public.my_farm_ids()));
create policy "équipe ferme : retrait par owner" on public.farm_members for delete to authenticated
  using (public.is_farm_owner(farm_id) and user_id <> auth.uid());
create policy "équipe ferme : changement de rôle par owner" on public.farm_members for update to authenticated
  using (public.is_farm_owner(farm_id) and user_id <> auth.uid())
  with check (public.is_farm_owner(farm_id));

drop policy "jardins : membres" on public.gardens;
create policy "jardins : équipe de la ferme" on public.gardens for all to authenticated
  using (farm_id in (select public.my_farm_ids()))
  with check (farm_id in (select public.my_farm_ids()));

drop policy "planches : membres" on public.planches;
create policy "planches : équipe de la ferme" on public.planches for all to authenticated
  using (garden_id in (select g.id from public.gardens g where g.farm_id in (select public.my_farm_ids())))
  with check (garden_id in (select g.id from public.gardens g where g.farm_id in (select public.my_farm_ids())));

-- ------------------------------------------------------------
-- I. Droits
-- ------------------------------------------------------------
revoke all on public.farms, public.farm_members from anon;
revoke execute on function
  public.my_farm_ids(), public.is_farm_owner(uuid), public.farm_team(uuid),
  public.duplicate_season_plan(uuid, text, int, int),
  public.farm_member_sync(), public.team_member_unlink(), public.season_set_farm(),
  public.garden_set_farm(), public.farm_add_creator()
from public, anon, authenticated;
grant execute on function
  public.my_farm_ids(), public.is_farm_owner(uuid), public.farm_team(uuid),
  public.duplicate_season_plan(uuid, text, int, int)
to authenticated;
