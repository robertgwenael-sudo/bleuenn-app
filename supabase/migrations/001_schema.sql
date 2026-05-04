-- ============================================================
-- BLEUENN SaaS — Schéma Supabase
-- Ferme florale dynamique multi-saisons
-- ============================================================

-- Extension pour UUID
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. PROFILS UTILISATEURS
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  farm_name text default 'Ma Ferme Florale',
  owner_name text default '',
  created_at timestamptz default now()
);

-- ============================================================
-- 2. SAISONS
-- ============================================================
create table public.seasons (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,              -- ex: "Saison 1 — 2025"
  year int not null,
  revenue_goal numeric default 15000,
  is_active boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- 3. CATALOGUE DES CULTURES (référentiel technique)
--    Données partagées, l'utilisateur peut ajouter les siennes
-- ============================================================
create table public.culture_catalog (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,  -- null = données système
  name text not null,
  type text not null check (type in ('RR','MP','RU')),
  jours_cellule int default 0,
  jours_champ int not null,
  jours_recolte int default 21,
  rendement_plant numeric default 1,
  prix_tige numeric default 0.50,
  temp_germination numeric,
  pincer boolean default false,
  filet boolean default false,
  couvre_sol boolean default false,
  semis_direct boolean default false,
  espacement_cm numeric default 20,
  rangs_par_planche int default 5,
  graines_par_plant numeric default 1,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- 4. JARDINS
-- ============================================================
create table public.gardens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null,              -- ex: "Jardin A"
  surface_m2 numeric not null,
  description text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- 5. PLANCHES
-- ============================================================
create table public.planches (
  id uuid primary key default uuid_generate_v4(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  name text not null,              -- ex: "PL 1"
  surface_m2 numeric not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- 6. PLANTATIONS (le cœur : une culture assignée à une planche)
--    Les dates se calculent automatiquement à partir de date_semis
-- ============================================================
create table public.plantings (
  id uuid primary key default uuid_generate_v4(),
  planche_id uuid not null references public.planches(id) on delete cascade,
  culture_id uuid not null references public.culture_catalog(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete cascade,

  -- Surface allouée à cette culture sur la planche (en m²)
  surface_m2 numeric not null default 1,

  -- La SEULE date saisie par l'utilisateur
  date_semis date not null,

  -- Dates calculées automatiquement (trigger)
  date_plantation date generated always as (
    case when jours_cellule_override > 0 then date_semis + jours_cellule_override
         else date_semis end
  ) stored,
  date_recolte date,   -- calculé par trigger (car dépend du catalogue)
  date_fin date,        -- calculé par trigger

  -- Overrides optionnels (sinon on prend le catalogue)
  jours_cellule_override int default 0,
  jours_champ_override int,
  jours_recolte_override int,
  rendement_override numeric,
  prix_override numeric,

  -- Données calculées
  plants_count int,
  tiges_estimees numeric,
  revenu_estime numeric,
  graines_necessaires int,

  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- Trigger : calcul automatique des dates et estimations
-- ============================================================
create or replace function calc_planting_dates()
returns trigger as $$
declare
  cat record;
  pl record;
  j_cellule int;
  j_champ int;
  j_recolte int;
  rend numeric;
  prix numeric;
  surface numeric;
  espacement numeric;
  plants int;
begin
  -- Récupérer les données du catalogue
  select * into cat from public.culture_catalog where id = new.culture_id;
  select * into pl from public.planches where id = new.planche_id;

  -- Résoudre les valeurs (override ou catalogue)
  j_cellule := coalesce(nullif(new.jours_cellule_override, 0), cat.jours_cellule, 0);
  j_champ   := coalesce(new.jours_champ_override, cat.jours_champ);
  j_recolte := coalesce(new.jours_recolte_override, cat.jours_recolte, 21);
  rend      := coalesce(new.rendement_override, cat.rendement_plant, 1);
  prix      := coalesce(new.prix_override, cat.prix_tige, 0.50);
  -- Utiliser la surface allouée à cette culture (pas la planche entière)
  surface   := new.surface_m2;
  espacement := coalesce(cat.espacement_cm, 20);

  -- Calcul des dates
  new.jours_cellule_override := j_cellule;
  new.date_recolte := new.date_semis + j_cellule + j_champ;
  new.date_fin     := new.date_recolte + j_recolte;

  -- Calcul des estimations
  -- Plants par m² basé sur l'espacement (simplifié : rangs * longueur / espacement)
  plants := greatest(1, floor(surface * 10000 / (espacement * espacement)));
  -- Plafonner à un nombre raisonnable
  if plants > surface * 50 then plants := (surface * 25)::int; end if;

  new.plants_count       := plants;
  new.tiges_estimees     := round(plants * rend * 0.7, 0);  -- -30% perte
  new.revenu_estime      := round(new.tiges_estimees * prix, 2);
  new.graines_necessaires := ceil(plants * 1.3 * coalesce(cat.graines_par_plant, 1));

  return new;
end;
$$ language plpgsql;

create trigger trg_calc_planting
  before insert or update on public.plantings
  for each row execute function calc_planting_dates();

-- ============================================================
-- 7. RÉCOLTES
-- ============================================================
create table public.harvests (
  id uuid primary key default uuid_generate_v4(),
  planting_id uuid not null references public.plantings(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  date date not null,
  tiges int not null,
  quality char(1) default 'A' check (quality in ('A','B','C')),
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- 8. VENTES
-- ============================================================
create table public.sales (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  channel text not null check (channel in ('Marché','Fleuriste','Abonnements','Mariage','Deuil')),
  cultures_sold text,     -- texte libre "Zinnia, Cosmos..."
  tiges int not null,
  prix_unitaire numeric not null,
  total numeric generated always as (tiges * prix_unitaire) stored,
  client text,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- 9. COMMANDES DE GRAINES
-- ============================================================
create table public.seed_orders (
  id uuid primary key default uuid_generate_v4(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  culture_name text not null,
  graines_needed int default 0,
  graines_ordered int default 0,
  supplier text,
  bio boolean default false,
  received boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.culture_catalog enable row level security;
alter table public.gardens enable row level security;
alter table public.planches enable row level security;
alter table public.plantings enable row level security;
alter table public.harvests enable row level security;
alter table public.sales enable row level security;
alter table public.seed_orders enable row level security;

-- Policies : chaque user voit uniquement ses données
create policy "Users see own profile" on public.profiles for all using (id = auth.uid());
create policy "Users manage own seasons" on public.seasons for all using (user_id = auth.uid());
create policy "Users see system + own catalog" on public.culture_catalog for select using (user_id is null or user_id = auth.uid());
create policy "Users manage own catalog" on public.culture_catalog for insert with check (user_id = auth.uid());
create policy "Users update catalog" on public.culture_catalog for update using (user_id is null or user_id = auth.uid());
create policy "Users delete catalog" on public.culture_catalog for delete using (user_id is null or user_id = auth.uid());
create policy "Users manage own gardens" on public.gardens for all using (user_id = auth.uid());

-- Pour planches et plantings, on passe par les jointures
create policy "Users manage own planches" on public.planches for all
  using (garden_id in (select id from public.gardens where user_id = auth.uid()));

create policy "Users manage own plantings" on public.plantings for all
  using (season_id in (select id from public.seasons where user_id = auth.uid()));

create policy "Users manage own harvests" on public.harvests for all
  using (season_id in (select id from public.seasons where user_id = auth.uid()));

create policy "Users manage own sales" on public.sales for all using (user_id = auth.uid());
create policy "Users manage own seed_orders" on public.seed_orders for all using (user_id = auth.uid());

-- ============================================================
-- TRIGGER : Créer le profil automatiquement à l'inscription
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- SEED DATA : Catalogue de cultures par défaut (système)
-- ============================================================
insert into public.culture_catalog (user_id, name, type, jours_cellule, jours_champ, jours_recolte, rendement_plant, prix_tige, temp_germination, pincer, filet, couvre_sol, espacement_cm, rangs_par_planche, graines_par_plant, notes) values
  (null, 'Statice', 'MP', 30, 80, 21, 3, 0.50, 20, false, false, true, 20, 5, 1, 'Sécher à l''envers après récolte'),
  (null, 'Célosie à plumes', 'MP', 23, 72, 21, 2, 0.80, 22, true, false, true, 20, 5, 3, 'Pincer à 20cm pour plus de tiges'),
  (null, 'Acroclinium', 'RR', 25, 60, 21, 3, 0.60, 20, false, false, true, 20, 5, 1, null),
  (null, 'Pavot d''Islande', 'RR', 30, 70, 21, 6, 0.85, 18, false, false, true, 20, 5, 1, 'Récolter au stade bouton'),
  (null, 'Nigelle', 'RU', 0, 70, 21, 1, 0.75, 18, false, false, false, 20, 5, 1, 'Semis direct possible'),
  (null, 'Gomphrena', 'MP', 30, 80, 21, 3, 0.50, 22, false, false, true, 20, 5, 1, null),
  (null, 'Anémone', 'RR', 0, 120, 56, 3, 0.80, 10, false, false, false, 15, 5, 1, 'Bulbe automne — planter en novembre'),
  (null, 'Renoncule', 'RR', 0, 120, 56, 4, 0.80, 10, false, false, false, 15, 5, 1, 'Bulbe automne — tremper 4h avant'),
  (null, 'Tulipe', 'RU', 0, 120, 28, 1, 0.50, 8, false, false, false, 12, 5, 1, 'Bulbe automne'),
  (null, 'Delphinium', 'MP', 30, 70, 21, 1, 1.00, 20, false, false, true, 20, 5, 1, null),
  (null, 'Immortelle', 'RU', 30, 60, 21, 1, 0.50, 20, false, false, true, 20, 5, 1, 'Sécher tête en bas'),
  (null, 'Craspedia', 'RR', 30, 80, 21, 5, 0.85, 20, false, false, true, 20, 5, 1, null),
  (null, 'Ammobium', 'RR', 25, 60, 21, 3, 0.60, 20, false, false, true, 20, 5, 1, null),
  (null, 'Scabieuse', 'RR', 30, 60, 21, 4, 0.85, 18, true, true, true, 20, 5, 1, null),
  (null, 'Carthame', 'RR', 25, 60, 21, 1, 0.60, 20, false, false, true, 20, 5, 1, null),
  (null, 'Cérinthe', 'RR', 25, 45, 21, 3, 0.80, 20, false, false, true, 20, 5, 1, null),
  (null, 'Cosmos', 'RR', 25, 60, 42, 4, 0.70, 20, false, false, true, 30, 4, 1, 'Fenêtre de récolte très longue'),
  (null, 'Matricaire', 'MP', 30, 70, 21, 3, 0.80, 20, false, false, true, 20, 5, 1, null),
  (null, 'Muflier', 'RU', 30, 70, 21, 1, 1.00, 20, false, false, true, 20, 5, 1, 'Replanter toutes les 2 semaines'),
  (null, 'Lonas', 'RR', 25, 60, 21, 3, 0.50, 20, false, false, true, 20, 5, 1, null),
  (null, 'Nielle', 'RR', 30, 50, 21, 4, 0.60, 20, false, true, true, 20, 5, 1, null),
  (null, 'Ammi', 'MP', 25, 50, 21, 3, 0.50, 16, false, true, true, 30, 3, 2, null),
  (null, 'Basilic', 'RR', 25, 60, 21, 3, 0.40, 22, false, false, false, 20, 5, 1, null),
  (null, 'Cloches d''Irlande', 'MP', 30, 70, 21, 2, 0.80, 18, true, true, true, 20, 5, 1, null),
  (null, 'Aneth', 'RU', 0, 105, 21, 2, 0.80, 20, false, false, true, 20, 5, 1, 'Semis direct'),
  (null, 'Godetie', 'RU', 25, 50, 21, 1, 0.50, 20, false, false, true, 20, 5, 1, null),
  (null, 'Rudbeckie', 'MP', 37, 83, 21, 3, 1.05, 20, false, false, true, 20, 5, 1, null),
  (null, 'Gypsophile', 'RR', 25, 50, 21, 1, 0.90, 18, false, false, true, 20, 5, 1, null),
  (null, 'Tagète', 'RR', 25, 65, 21, 5, 1.00, 22, true, false, true, 20, 5, 1, null),
  (null, 'Didiscus', 'RR', 25, 75, 21, 5, 0.85, 20, true, true, true, 20, 5, 1, null),
  (null, 'Lin', 'RU', 0, 60, 21, 1, 0.20, 18, false, false, false, 10, 5, 1, 'Semis direct en masse'),
  (null, 'Dahlia', 'RR', 0, 90, 56, 5, 1.20, 22, true, false, true, 30, 3, 1, 'Tubercule — pincer tôt'),
  (null, 'Chrysanthème', 'RR', 25, 60, 21, 3, 0.50, 20, false, false, true, 20, 5, 1, null),
  (null, 'Giroflée', 'RU', 25, 65, 21, 1, 0.75, 18, false, false, true, 20, 5, 1, null),
  (null, 'Centaurée Bleuet', 'RR', 25, 45, 21, 3, 0.40, 18, true, true, true, 20, 5, 1, null),
  (null, 'Myosotis chinois', 'RR', 25, 60, 21, 3, 0.85, 20, false, false, true, 20, 5, 1, null),
  (null, 'Hélenium', 'RR', 25, 60, 21, 3, 0.30, 20, false, false, true, 20, 5, 1, null),
  (null, 'Soleil du Mexique', 'RR', 21, 60, 21, 3, 0.30, 22, false, false, true, 20, 5, 1, null),
  (null, 'Tournesol', 'RU', 0, 65, 7, 1, 0.50, 22, false, false, false, 20, 5, 1, 'Tige unique — semis direct toutes les 2 semaines'),
  (null, 'Zinnia', 'RR', 23, 67, 56, 6, 0.70, 20, true, false, true, 20, 5, 1, 'Pincer pour buisson'),
  (null, 'Phlox', 'RR', 25, 55, 21, 5, 0.80, 18, true, true, true, 20, 5, 1, null),
  (null, 'Orlaya', 'MP', 30, 40, 21, 3, 0.70, 16, false, false, true, 20, 5, 1, null),
  (null, 'Aster de Chine', 'RU', 35, 60, 21, 1, 0.50, 20, false, true, true, 20, 5, 1, null),
  (null, 'Achillée', 'RR', 30, 335, 42, 5, 0.70, 18, false, false, true, 20, 5, 1, 'Vivace — production dès année 2'),
  (null, 'Éringium', 'MP', 30, 335, 21, 1, 1.00, 18, false, false, true, 20, 5, 1, 'Vivace'),
  (null, 'Ancolie', 'MP', 0, 365, 21, 3, 0.85, 20, false, false, true, 22, 5, 2, 'Bisannuelle — stratification nécessaire'),
  (null, 'Sauge', 'RR', 25, 60, 21, 3, 0.40, 22, false, false, false, 20, 5, 1, 'Aromatique à fleurs'),
  (null, 'Origan', 'RR', 25, 60, 21, 3, 0.40, 22, false, false, false, 20, 5, 1, 'Aromatique à fleurs'),
  (null, 'Shizo', 'RR', 25, 60, 21, 3, 0.40, 22, false, false, false, 20, 5, 1, 'Feuillage décoratif');

-- ============================================================
-- VUES UTILES
-- ============================================================

-- Vue complète d'une plantation avec toutes les infos résolues
create or replace view public.plantings_full as
select
  p.id,
  p.planche_id,
  p.culture_id,
  p.season_id,
  p.date_semis,
  p.date_semis + coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0) as date_plantation,
  p.date_recolte,
  p.date_fin,
  p.plants_count,
  p.tiges_estimees,
  p.revenu_estime,
  p.graines_necessaires,
  p.surface_m2 as planting_m2,
  p.notes as planting_notes,
  c.name as culture_name,
  c.type as culture_type,
  coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0) as jours_cellule,
  coalesce(p.jours_champ_override, c.jours_champ) as jours_champ,
  coalesce(p.jours_recolte_override, c.jours_recolte, 21) as jours_recolte,
  coalesce(p.rendement_override, c.rendement_plant) as rendement,
  coalesce(p.prix_override, c.prix_tige) as prix_tige,
  c.temp_germination,
  c.pincer,
  c.filet,
  c.couvre_sol,
  pl.name as planche_name,
  pl.surface_m2 as planche_m2,
  g.name as garden_name,
  g.id as garden_id,
  g.surface_m2 as garden_m2,
  s.user_id
from public.plantings p
join public.culture_catalog c on c.id = p.culture_id
join public.planches pl on pl.id = p.planche_id
join public.gardens g on g.id = pl.garden_id
join public.seasons s on s.id = p.season_id;
