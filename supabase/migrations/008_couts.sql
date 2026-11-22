-- ============================================================
-- 008 : dépenses, temps passé, taux horaire de la ferme
-- ============================================================
-- But : savoir ce qui est rentable, culture par culture, une fois les
-- dépenses ET le temps comptés (« le zinnia rapporte X € de marge par m²,
-- le dahlia Y € une fois le temps compté »). Les calculs sont faits dans
-- l'appli (src/lib/domain/couts.ts) ; la base ne stocke que les faits.
--
-- Choix :
--  * costs et time_entries sont rattachées à une SAISON DE GESTION
--    (season_id) : c'est elle qui porte le CA et le bilan. Une dépense
--    d'automne pour des renoncules récoltées l'an prochain s'impute à la
--    saison choisie par l'utilisatrice, pas à la date de la facture ;
--  * farm_id est redondant avec la saison mais utile (lecture ferme
--    entière, exports). Il n'est JAMAIS fourni par le client : le trigger
--    `couts_set_farm` le recopie depuis la saison, à l'insertion comme à
--    la modification. Il ne peut donc pas contredire la saison ;
--  * la RLS suit le modèle de 005 (pertes, tâches) : tout membre de la
--    ferme lit et écrit les lignes des saisons de la ferme
--    (`my_season_ids()`). Ni la policy ni le RETURNING d'un INSERT ne
--    relisent une table modifiée par la même instruction : my_season_ids()
--    lit seasons et farm_members, que cet INSERT ne touche pas ;
--  * culture_id et planche_id sont facultatifs : une dépense sans culture
--    est un frais général, réparti à l'écran selon une clé choisie (surface
--    ou CA) et affichée comme hypothèse. Le trigger vérifie qu'ils
--    appartiennent bien à la ferme (catalogue système ou d'un membre,
--    planche d'un jardin de la ferme) : pas d'identifiant d'une autre ferme ;
--  * time_entries.user_id = qui a travaillé ; il doit être membre de la
--    ferme au moment de la saisie (vérifié à l'insertion et quand on le
--    change, pas à chaque modification : quelqu'un qui a quitté l'équipe
--    garde ses heures passées) ;
--  * farms.taux_horaire : euros par heure, NULL par défaut et sans valeur
--    en dur. Tant qu'il est vide, la valorisation du temps est « non
--    calculable » à l'écran, jamais 0 €. Seul un owner le modifie : la
--    policy « fermes : modification owner » (006) s'applique déjà ;
--  * montants en numeric(12,2) strictement positifs, minutes entières > 0 ;
--  * suppression d'une culture du catalogue : refusée si des dépenses ou
--    des temps y sont rattachés (on delete restrict, comme plantings) ;
--    suppression d'une planche : la ligne reste, sans planche.
-- Retour arrière : voir le bloc commenté en fin de fichier.
-- ============================================================

-- ------------------------------------------------------------
-- A. Taux horaire de la ferme
-- ------------------------------------------------------------
alter table public.farms add column taux_horaire numeric(10,2)
  check (taux_horaire is null or taux_horaire > 0);
comment on column public.farms.taux_horaire is
  'Euros par heure pour valoriser le temps passé. NULL = non renseigné : valorisation non calculable.';

-- ------------------------------------------------------------
-- B. Dépenses
-- ------------------------------------------------------------
create table public.costs (
  id          uuid primary key default gen_random_uuid(),
  farm_id     uuid not null references public.farms(id) on delete cascade,
  season_id   uuid not null references public.seasons(id) on delete cascade,
  date        date not null,
  category    text not null
              check (category in ('semences','plants_bulbes','terreau_substrat','engrais_traitements',
                                  'materiel','emballage','transport','main_oeuvre_externe','autre')),
  amount      numeric(12,2) not null check (amount > 0),
  culture_id  uuid references public.culture_catalog(id) on delete restrict,
  planche_id  uuid references public.planches(id) on delete set null,
  supplier    text,
  notes       text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index costs_season_date_idx on public.costs(season_id, date);
create index costs_culture_idx on public.costs(culture_id) where culture_id is not null;
create index costs_planche_idx on public.costs(planche_id) where planche_id is not null;

-- ------------------------------------------------------------
-- C. Temps passé
-- ------------------------------------------------------------
create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  farm_id     uuid not null references public.farms(id) on delete cascade,
  season_id   uuid not null references public.seasons(id) on delete cascade,
  date        date not null,
  minutes     integer not null check (minutes > 0 and minutes <= 1440),
  kind        text not null default 'autre'
              check (kind in ('semis','repiquage','plantation','pincage','tuteurage','desherbage',
                              'recolte','irrigation','traitement','livraison',
                              'vente','administratif','autre')),
  culture_id  uuid references public.culture_catalog(id) on delete restrict,
  planche_id  uuid references public.planches(id) on delete set null,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  notes       text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index time_entries_season_date_idx on public.time_entries(season_id, date);
create index time_entries_culture_idx on public.time_entries(culture_id) where culture_id is not null;
create index time_entries_planche_idx on public.time_entries(planche_id) where planche_id is not null;
create index time_entries_user_idx on public.time_entries(user_id);

-- ------------------------------------------------------------
-- D. Cohérence : farm_id recopié de la saison, références de la ferme
-- ------------------------------------------------------------
create or replace function public.couts_set_farm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select s.farm_id into new.farm_id from public.seasons s where s.id = new.season_id;
  if new.farm_id is null then
    raise exception 'Saison % introuvable', new.season_id;
  end if;

  if new.planche_id is not null and not exists (
    select 1 from public.planches pl join public.gardens g on g.id = pl.garden_id
    where pl.id = new.planche_id and g.farm_id = new.farm_id
  ) then
    raise exception 'Planche % hors de la ferme', new.planche_id;
  end if;

  if new.culture_id is not null and not exists (
    select 1 from public.culture_catalog c
    where c.id = new.culture_id
      and (c.user_id is null
           or c.user_id in (select fm.user_id from public.farm_members fm where fm.farm_id = new.farm_id))
  ) then
    raise exception 'Culture % hors du catalogue de la ferme', new.culture_id;
  end if;

  -- PL/pgSQL n'évalue pas en court-circuit : new.user_id n'existe pas sur
  -- costs, d'où les if imbriqués.
  if tg_table_name = 'time_entries' then
    if (tg_op = 'INSERT' or new.user_id is distinct from old.user_id or new.farm_id is distinct from old.farm_id)
       and not exists (select 1 from public.farm_members fm
                       where fm.farm_id = new.farm_id and fm.user_id = new.user_id) then
      raise exception 'La personne % n''est pas membre de la ferme', new.user_id;
    end if;
  end if;
  return new;
end; $$;

create trigger trg_costs_set_farm before insert or update on public.costs
  for each row execute function public.couts_set_farm();
create trigger trg_time_entries_set_farm before insert or update on public.time_entries
  for each row execute function public.couts_set_farm();

-- ------------------------------------------------------------
-- E. RLS
-- ------------------------------------------------------------
alter table public.costs        enable row level security;
alter table public.time_entries enable row level security;

create policy "dépenses : membres" on public.costs for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));
create policy "temps passé : membres" on public.time_entries for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));

-- ------------------------------------------------------------
-- F. Droits
-- ------------------------------------------------------------
revoke all on public.costs, public.time_entries from anon;
revoke execute on function public.couts_set_farm() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Retour arrière (à exécuter à la main si besoin) :
--   drop table public.time_entries;
--   drop table public.costs;
--   drop function public.couts_set_farm();
--   alter table public.farms drop column taux_horaire;
-- ------------------------------------------------------------
