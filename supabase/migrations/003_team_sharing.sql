-- ============================================================
-- 003 : Partage d'équipe — plusieurs utilisateurs par saison
-- ============================================================

-- 1. Table des membres d'équipe
create table public.team_members (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  unique(season_id, user_id)
);

alter table public.team_members enable row level security;

-- 2. Token d'invitation sur la saison
alter table public.seasons add column if not exists invite_token uuid default uuid_generate_v4();
alter table public.seasons add column if not exists invite_enabled boolean default false;

-- 3. Peupler team_members pour les saisons existantes (le créateur = owner)
insert into public.team_members (season_id, user_id, role)
select id, user_id, 'owner' from public.seasons
on conflict (season_id, user_id) do nothing;

-- ============================================================
-- 4. Fonction helper : l'utilisateur est-il membre de cette saison ?
-- ============================================================
create or replace function public.is_team_member(p_season_id uuid)
returns boolean as $$
  select exists(
    select 1 from public.team_members
    where season_id = p_season_id and user_id = auth.uid()
  );
$$ language sql security definer stable;

-- Fonction helper : l'utilisateur est-il owner de cette saison ?
create or replace function public.is_team_owner(p_season_id uuid)
returns boolean as $$
  select exists(
    select 1 from public.team_members
    where season_id = p_season_id and user_id = auth.uid() and role = 'owner'
  );
$$ language sql security definer stable;

-- Toutes les season_ids auxquelles l'utilisateur a accès
create or replace function public.my_season_ids()
returns setof uuid as $$
  select season_id from public.team_members where user_id = auth.uid();
$$ language sql security definer stable;

-- ============================================================
-- 5. Politiques RLS pour team_members
-- ============================================================
create policy "Members see their teams"
  on public.team_members for select
  using (season_id in (select public.my_season_ids()));

create policy "Owners manage team"
  on public.team_members for insert
  with check (true);  -- L'insertion est contrôlée par la fonction join

create policy "Owners delete members"
  on public.team_members for delete
  using (public.is_team_owner(season_id));

-- ============================================================
-- 6. Mettre à jour les politiques RLS existantes
--    Remplacer user_id = auth.uid() par "membre de la saison"
-- ============================================================

-- SEASONS : voir les saisons dont on est membre
drop policy if exists "Users manage own seasons" on public.seasons;
create policy "Team members see seasons"
  on public.seasons for select
  using (id in (select public.my_season_ids()));
create policy "Owners manage seasons"
  on public.seasons for insert
  with check (user_id = auth.uid());
create policy "Owners update seasons"
  on public.seasons for update
  using (public.is_team_owner(id));
create policy "Owners delete seasons"
  on public.seasons for delete
  using (public.is_team_owner(id));

-- Politique pour lire une saison par invite_token (pour rejoindre)
create policy "Anyone can read season by invite token"
  on public.seasons for select
  using (invite_enabled = true and invite_token is not null);

-- GARDENS : membres de la saison
drop policy if exists "Users manage own gardens" on public.gardens;
create policy "Team members manage gardens"
  on public.gardens for all
  using (season_id in (select public.my_season_ids()));

-- PLANCHES : via gardens de la saison
drop policy if exists "Users manage planches via garden" on public.planches;
create policy "Team members manage planches"
  on public.planches for all
  using (garden_id in (
    select g.id from public.gardens g where g.season_id in (select public.my_season_ids())
  ));

-- PLANTINGS : membres de la saison
drop policy if exists "Users manage plantings" on public.plantings;
create policy "Team members manage plantings"
  on public.plantings for all
  using (season_id in (select public.my_season_ids()));

-- HARVESTS : membres de la saison
drop policy if exists "Users manage harvests" on public.harvests;
create policy "Team members manage harvests"
  on public.harvests for all
  using (season_id in (select public.my_season_ids()));

-- SALES : membres de la saison
drop policy if exists "Users manage own sales" on public.sales;
create policy "Team members manage sales"
  on public.sales for all
  using (season_id in (select public.my_season_ids()));

-- SEED_ORDERS : membres de la saison
drop policy if exists "Users manage own seed_orders" on public.seed_orders;
create policy "Team members manage seed_orders"
  on public.seed_orders for all
  using (season_id in (select public.my_season_ids()));

-- ============================================================
-- 7. Fonction pour rejoindre par token
-- ============================================================
create or replace function public.join_season_by_token(p_token uuid)
returns json as $$
declare
  v_season_id uuid;
  v_season_name text;
begin
  select id, name into v_season_id, v_season_name
  from public.seasons
  where invite_token = p_token and invite_enabled = true;

  if v_season_id is null then
    return json_build_object('error', 'Lien invalide ou désactivé');
  end if;

  -- Vérifier si déjà membre
  if exists(select 1 from public.team_members where season_id = v_season_id and user_id = auth.uid()) then
    return json_build_object('ok', true, 'season_id', v_season_id, 'message', 'Déjà membre');
  end if;

  insert into public.team_members (season_id, user_id, role)
  values (v_season_id, auth.uid(), 'member');

  return json_build_object('ok', true, 'season_id', v_season_id, 'season_name', v_season_name);
end;
$$ language plpgsql security definer;

-- ============================================================
-- 8. Invitations par email
-- ============================================================

-- Table des invitations en attente (pour les emails pas encore inscrits)
create table public.pending_invites (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  email text not null,
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz default now(),
  unique(season_id, email)
);

alter table public.pending_invites enable row level security;

create policy "Team owners manage invites"
  on public.pending_invites for all
  using (season_id in (select season_id from public.team_members where user_id = auth.uid() and role = 'owner'));

-- Fonction : inviter par email
-- Si le profil existe → ajout direct dans team_members
-- Sinon → enregistrement dans pending_invites
create or replace function public.invite_by_email(p_season_id uuid, p_email text)
returns json as $$
declare
  v_target_id uuid;
  v_already boolean;
begin
  -- Vérifier que l'appelant est owner
  if not public.is_team_owner(p_season_id) then
    return json_build_object('error', 'Seul le propriétaire peut inviter');
  end if;

  -- Chercher si le profil existe (via auth.users)
  select id into v_target_id
  from auth.users
  where email = lower(trim(p_email));

  if v_target_id is not null then
    -- Vérifier si déjà membre
    select exists(
      select 1 from public.team_members where season_id = p_season_id and user_id = v_target_id
    ) into v_already;

    if v_already then
      return json_build_object('status', 'already_member', 'message', 'Déjà membre de l''équipe');
    end if;

    -- Ajout direct
    insert into public.team_members (season_id, user_id, role)
    values (p_season_id, v_target_id, 'member');

    return json_build_object('status', 'added', 'message', 'Membre ajouté directement');
  else
    -- Email pas encore inscrit → invitation en attente
    insert into public.pending_invites (season_id, email, invited_by)
    values (p_season_id, lower(trim(p_email)), auth.uid())
    on conflict (season_id, email) do nothing;

    return json_build_object('status', 'pending', 'message', 'Invitation enregistrée — sera activée à l''inscription');
  end if;
end;
$$ language plpgsql security definer;

-- Fonction appelée après inscription : convertir les invitations en attente
-- À brancher sur un trigger after insert sur profiles
create or replace function public.convert_pending_invites()
returns trigger as $$
declare
  v_email text;
  r record;
begin
  -- Récupérer l'email depuis auth.users
  select email into v_email from auth.users where id = new.id;

  if v_email is not null then
    for r in select * from public.pending_invites where email = lower(v_email) loop
      insert into public.team_members (season_id, user_id, role)
      values (r.season_id, new.id, 'member')
      on conflict (season_id, user_id) do nothing;

      delete from public.pending_invites where id = r.id;
    end loop;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Trigger : quand un profil est créé, convertir ses invitations
drop trigger if exists trg_convert_invites on public.profiles;
create trigger trg_convert_invites
  after insert on public.profiles
  for each row execute function public.convert_pending_invites();
