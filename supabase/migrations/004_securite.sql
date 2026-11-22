-- ============================================================
-- 004 : Sécurisation des accès (RLS, fonctions, vue)
-- ============================================================
-- Corrige :
--  1. team_members : n'importe quel compte pouvait s'inscrire owner de
--     n'importe quelle saison (policy INSERT with check (true)).
--  2. seasons : toute saison avec lien d'invitation actif était lisible
--     par tous, y compris sans compte, jeton compris.
--  3. culture_catalog : les règles « user_id is null » laissaient modifier
--     et supprimer les lignes système par n'importe qui ; à l'inverse le
--     catalogue d'un propriétaire restait invisible pour son équipe.
--  4. plantings_full : vue exécutée avec les droits de son créateur,
--     donc hors RLS : toutes les plantations lisibles par tout compte.
--  5. Fonctions security definer appelables sans compte, sans search_path.
--  6. Anciennes policies de 001 restées en place (noms mal recopiés en 003).
--  7. Liste des membres d'équipe : le join vers profiles était refusé par
--     RLS, les emails des coéquipiers ne s'affichaient jamais.
-- ============================================================

-- ------------------------------------------------------------
-- A. Fonctions d'appartenance (security definer, search_path figé)
-- ------------------------------------------------------------
create or replace function public.my_season_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select season_id from public.team_members where user_id = auth.uid();
$$;

create or replace function public.is_team_member(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.team_members
    where season_id = p_season_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.team_members
    where season_id = p_season_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Comptes qui partagent au moins une saison avec moi (moi compris).
-- Sert au partage du catalogue de cultures au sein d'une équipe.
create or replace function public.my_teammate_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select auth.uid()
  union
  select tm2.user_id
  from public.team_members tm1
  join public.team_members tm2 on tm2.season_id = tm1.season_id
  where tm1.user_id = auth.uid();
$$;

-- Membres d'une saison avec leur email (profiles n'est lisible que par
-- son propriétaire, d'où cette fonction qui n'expose que ces colonnes).
create or replace function public.season_team(p_season_id uuid)
returns table (id uuid, season_id uuid, user_id uuid, role text, joined_at timestamptz, email text, owner_name text)
language sql stable security definer set search_path = ''
as $$
  select tm.id, tm.season_id, tm.user_id, tm.role, tm.joined_at, p.email, p.owner_name
  from public.team_members tm
  join public.profiles p on p.id = tm.user_id
  where tm.season_id = p_season_id
    and public.is_team_member(p_season_id)
  order by tm.joined_at;
$$;

-- ------------------------------------------------------------
-- B. Fonctions métier : search_path figé, auth exigée
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create or replace function public.convert_pending_invites()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if new.email is not null then
    for r in select * from public.pending_invites where email = lower(new.email) loop
      insert into public.team_members (season_id, user_id, role)
      values (r.season_id, new.id, 'member')
      on conflict (season_id, user_id) do nothing;
      delete from public.pending_invites where id = r.id;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.join_season_by_token(p_token uuid)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v_season_id uuid;
  v_season_name text;
begin
  if auth.uid() is null then
    return json_build_object('error', 'Connexion requise');
  end if;

  select id, name into v_season_id, v_season_name
  from public.seasons
  where invite_token = p_token and invite_enabled = true;

  if v_season_id is null then
    return json_build_object('error', 'Lien invalide ou désactivé');
  end if;

  if exists(select 1 from public.team_members where season_id = v_season_id and user_id = auth.uid()) then
    return json_build_object('ok', true, 'season_id', v_season_id, 'season_name', v_season_name, 'message', 'Déjà membre');
  end if;

  insert into public.team_members (season_id, user_id, role)
  values (v_season_id, auth.uid(), 'member');

  return json_build_object('ok', true, 'season_id', v_season_id, 'season_name', v_season_name);
end;
$$;

create or replace function public.invite_by_email(p_season_id uuid, p_email text)
returns json
language plpgsql security definer set search_path = ''
as $$
declare
  v_target_id uuid;
  v_email text := lower(trim(p_email));
begin
  if not public.is_team_owner(p_season_id) then
    return json_build_object('error', 'Seul le propriétaire peut inviter');
  end if;

  select id into v_target_id from auth.users where lower(email) = v_email;

  if v_target_id is not null then
    if exists(select 1 from public.team_members where season_id = p_season_id and user_id = v_target_id) then
      return json_build_object('status', 'already_member', 'message', 'Déjà membre de l''équipe');
    end if;
    insert into public.team_members (season_id, user_id, role) values (p_season_id, v_target_id, 'member');
    return json_build_object('status', 'added', 'message', 'Membre ajouté directement');
  end if;

  insert into public.pending_invites (season_id, email, invited_by)
  values (p_season_id, v_email, auth.uid())
  on conflict (season_id, email) do nothing;
  return json_build_object('status', 'pending', 'message', 'Invitation enregistrée, elle sera activée à l''inscription');
end;
$$;

-- Le créateur d'une saison en devient owner côté serveur : le client n'a
-- plus besoin (ni le droit) d'écrire dans team_members.
create or replace function public.add_season_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.team_members (season_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (season_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_add_season_owner on public.seasons;
create trigger trg_add_season_owner
  after insert on public.seasons
  for each row execute function public.add_season_owner();

-- Fonctions de trigger en security invoker : search_path figé aussi.
alter function public.calc_planting_dates() set search_path = '';
alter function public.propagate_catalog_changes() set search_path = '';

-- ------------------------------------------------------------
-- C. Droits d'exécution : rien pour anon, le strict nécessaire pour les
--    comptes connectés. Les fonctions de trigger ne s'appellent pas en RPC.
-- ------------------------------------------------------------
revoke execute on function
  public.my_season_ids(), public.is_team_member(uuid), public.is_team_owner(uuid),
  public.my_teammate_ids(), public.season_team(uuid),
  public.join_season_by_token(uuid), public.invite_by_email(uuid, text),
  public.handle_new_user(), public.convert_pending_invites(), public.add_season_owner(),
  public.calc_planting_dates(), public.propagate_catalog_changes()
from public, anon, authenticated;

grant execute on function
  public.my_season_ids(), public.is_team_member(uuid), public.is_team_owner(uuid),
  public.my_teammate_ids(), public.season_team(uuid),
  public.join_season_by_token(uuid), public.invite_by_email(uuid, text)
to authenticated;

-- ------------------------------------------------------------
-- D. Vue plantings_full : appliquer la RLS de l'appelant
-- ------------------------------------------------------------
alter view public.plantings_full set (security_invoker = true);
revoke all on public.plantings_full from anon;

-- ------------------------------------------------------------
-- E. Policies : on repart d'une base propre, réservée aux comptes connectés
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles
create policy "profil : soi-même" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- seasons
-- « user_id = auth.uid() » est indispensable : l'INSERT ... RETURNING du
-- client relit la saison avant que my_season_ids() (stable, snapshot du
-- début de l'ordre) ne voie la ligne owner ajoutée par le trigger.
create policy "saisons : lecture membres" on public.seasons
  for select to authenticated using (user_id = auth.uid() or id in (select public.my_season_ids()));
create policy "saisons : création" on public.seasons
  for insert to authenticated with check (user_id = auth.uid());
create policy "saisons : modification owner" on public.seasons
  for update to authenticated using (public.is_team_owner(id)) with check (public.is_team_owner(id));
create policy "saisons : suppression owner" on public.seasons
  for delete to authenticated using (public.is_team_owner(id));

-- team_members : lecture par l'équipe, suppression par l'owner (jamais
-- lui-même), aucune insertion directe (fonctions et trigger uniquement)
create policy "équipe : lecture membres" on public.team_members
  for select to authenticated using (season_id in (select public.my_season_ids()));
create policy "équipe : retrait par owner" on public.team_members
  for delete to authenticated using (public.is_team_owner(season_id) and user_id <> auth.uid());

-- pending_invites
create policy "invitations : owner" on public.pending_invites
  for all to authenticated
  using (public.is_team_owner(season_id))
  with check (public.is_team_owner(season_id) and invited_by = auth.uid());

-- culture_catalog : partagé dans l'équipe, chacun crée à son nom
create policy "catalogue : lecture équipe" on public.culture_catalog
  for select to authenticated using (user_id is null or user_id in (select public.my_teammate_ids()));
create policy "catalogue : création" on public.culture_catalog
  for insert to authenticated with check (user_id = auth.uid());
create policy "catalogue : modification équipe" on public.culture_catalog
  for update to authenticated
  using (user_id in (select public.my_teammate_ids()))
  with check (user_id in (select public.my_teammate_ids()));
create policy "catalogue : suppression équipe" on public.culture_catalog
  for delete to authenticated using (user_id in (select public.my_teammate_ids()));

-- Données de saison
create policy "jardins : membres" on public.gardens
  for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));

create policy "planches : membres" on public.planches
  for all to authenticated
  using (garden_id in (select g.id from public.gardens g where g.season_id in (select public.my_season_ids())))
  with check (garden_id in (select g.id from public.gardens g where g.season_id in (select public.my_season_ids())));

create policy "plantations : membres" on public.plantings
  for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));

create policy "récoltes : membres" on public.harvests
  for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));

create policy "ventes : membres" on public.sales
  for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));

create policy "graines : membres" on public.seed_orders
  for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));
