-- ============================================================
-- 016 : saisons en années civiles, préparer la saison suivante
-- ============================================================
-- Retour de Marine (22/11/2026) : une saison = une année civile (« 2026 »,
-- « 2027 »), du 1er janvier au 31 décembre, au lieu de septembre à
-- septembre. Une plantation appartient à la saison de l'année de sa
-- PREMIÈRE RÉCOLTE : des renoncules plantées le 1er novembre 2026 et
-- récoltées en mars 2027 relèvent de 2027 (son tableur, plan année 2,
-- lignes « 2 »). La lecture des planches, du calendrier, des tâches et des
-- disponibilités reste par dates, toutes saisons confondues.
--
-- ⚠ À APPLIQUER APRÈS 013 ET 015.
--   013 (cultures) : culture_catalog.cycle, plantings.arrachee_le et
--   achat_plant, lus par G et J ; correction des cycles du catalogue.
--   015 (semis) : trigger de calcul des plantations.
--   Les règles de G et J reposent sur les DATES DE RÉCOLTE, qui changent
--   avec ces deux migrations : appliquée avant, 016 classerait mal.
--
-- CONTENU
--  A. seasons.date_debut / date_fin : colonnes GÉNÉRÉES depuis `year`.
--  B. Année plausible (2000 à 2100), NOT VALID : l'existant n'est pas examiné.
--  C. Libellé = l'année : `name` devient `year` (« Saison 2 — 2026 » devient
--     « 2026 ») ; l'ancien nom est gardé dans `nom_initial`.
--  D. Une seule saison par année et par ferme, pour toute saison créée ou
--     dont l'année change (trigger). Les doublons éventuels déjà en base ne
--     sont ni supprimés ni fusionnés : la création suivante les signale.
--  E. plantations_hors_annee_de_recolte(ferme) : diagnostic en lecture.
--  F. reclasser_plantations(de, vers, ids) : rattache des plantations
--     CHOISIES à une autre saison de la ferme, atomique, owner seulement.
--  G. reprendre_plan_dans_saison(source, cible, décalage) : recopie le plan
--     dans une saison EXISTANTE, sans vivace en place, sans doublon, sans
--     les plantations dont la récolte n'est pas dans l'année source.
--  H. duplicate_season_plan (006) réécrite sur G : mêmes exclusions.
--  J. basculer_saison(saison, année, appliquer) : transforme une saison-plan
--     en l'année suivante (« 2026 » devient « 2027 ») ; aperçu, puis
--     application atomique.
--
-- DEUX PARCOURS À L'ÉCRAN, rien n'étant fait par la migration elle-même :
--  * « Passer cette saison en 2027 » = J (cas de la prod : la saison 2026
--    est un plan, sans récolte ni tâche ni dépense) ;
--  * « Préparer 2027 » = insert seasons (2027) puis F puis, en option, G
--    (cas d'une saison 2026 qui a un historique à garder).
--
-- Sur des données existantes : A ajoute deux colonnes calculées ; C renomme
-- chaque saison dont le nom n'est pas déjà son année (ancien nom conservé) ;
-- B et D ne touchent aucune ligne ; E, F, G ne font rien sans appel.
-- Récoltes, pertes, ventes, commandes, coûts et factures gardent toujours
-- leur season_id (datés, saisis dans une saison) ; seules les tâches
-- GÉNÉRÉES du plan (auto_key) suivent leur plantation en F.
--
-- Écrite, NON APPLIQUÉE. Avant application (règle 6 de CLAUDE.md), rejouer
-- dans une transaction terminée par `raise exception` puis `rollback` :
-- owner, membre, compte étranger, anonyme ; le parcours complet.
-- ============================================================

-- ------------------------------------------------------------
-- A. Bornes de la saison, dérivées de l'année
-- ------------------------------------------------------------
alter table public.seasons
  add column date_debut date generated always as (make_date(year, 1, 1)) stored,
  add column date_fin   date generated always as (make_date(year, 12, 31)) stored;

comment on column public.seasons.year is
  'Année civile de la saison (016) : du 1er janvier au 31 décembre. Une plantation y est rangée selon l''année de sa première récolte.';
comment on column public.seasons.date_debut is '1er janvier de year (générée, 016).';
comment on column public.seasons.date_fin is '31 décembre de year (générée, 016).';

-- ------------------------------------------------------------
-- B. Année plausible (n'examine pas l'existant)
-- ------------------------------------------------------------
alter table public.seasons
  add constraint seasons_annee_civile_check check (year between 2000 and 2100) not valid;

-- ------------------------------------------------------------
-- C. Libellé = l'année, ancien nom conservé
-- ------------------------------------------------------------
alter table public.seasons add column nom_initial text;
comment on column public.seasons.nom_initial is
  'Nom de la saison avant 016 (ex. « Saison 2 — 2026 »), quand il différait de l''année. Null sinon.';
update public.seasons
   set nom_initial = name, name = year::text
 where name is distinct from year::text;

-- ------------------------------------------------------------
-- D. Une saison par année et par ferme (nouvelles écritures)
-- ------------------------------------------------------------
-- security definer : le contrôle doit voir toutes les saisons de la ferme.
-- Nom choisi pour passer APRÈS trg_season_set_farm (ordre alphabétique),
-- qui renseigne farm_id à l'insertion.
create or replace function public.season_une_par_annee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_autre text;
begin
  if new.farm_id is null then return new; end if;
  -- sérialise deux créations simultanées de la même année
  perform pg_advisory_xact_lock(hashtext('season_une_par_annee:' || new.farm_id::text || ':' || new.year::text));
  select s.name into v_autre from public.seasons s
   where s.farm_id = new.farm_id and s.year = new.year and s.id <> new.id
   limit 1;
  if v_autre is not null then
    raise exception 'La saison % existe déjà dans cette ferme (« % »)', new.year, v_autre
      using errcode = '23505';
  end if;
  return new;
end; $$;

create trigger trg_season_une_par_annee
  before insert or update of year, farm_id on public.seasons
  for each row execute function public.season_une_par_annee();

-- ------------------------------------------------------------
-- E. Diagnostic : plantations hors de l'année de leur première récolte
-- ------------------------------------------------------------
-- security invoker : lit plantings_full avec la RLS de l'appelant (un
-- compte étranger à la ferme obtient zéro ligne). Corps en chaîne : pas de
-- dépendance enregistrée sur la vue, que 013 redéfinit.
create or replace function public.plantations_hors_annee_de_recolte(p_farm_id uuid)
returns table (
  planting_id uuid, culture_name text, date_recolte date,
  saison_actuelle uuid, annee_actuelle int, saison_cible uuid, annee_cible int
) language sql stable set search_path = '' as $$
  select p.id, p.culture_name, p.date_recolte,
         p.season_id, p.season_year,
         (select s.id from public.seasons s
           where s.farm_id = p_farm_id and s.year = extract(year from p.date_recolte)::int
           order by s.name limit 1),
         extract(year from p.date_recolte)::int
    from public.plantings_full p
   where p.farm_id = p_farm_id
     and p.date_recolte is not null
     and extract(year from p.date_recolte)::int <> p.season_year
   order by p.date_recolte, p.culture_name;
$$;

-- ------------------------------------------------------------
-- F. Rattacher des plantations choisies à une autre saison (atomique)
-- ------------------------------------------------------------
-- Owner des deux saisons, même ferme. Chaque id doit être dans la saison
-- source, sinon rien n'est fait. Les tâches générées (auto_key) suivent leur
-- plantation ; une tâche de même auto_key déjà dans la saison cible fait tout
-- échouer plutôt que d'en supprimer une. security invoker : les UPDATE
-- passent par la RLS (membres de la ferme) ; si elle en écarte une seule
-- ligne, le compte ne tombe pas juste et tout est annulé.
create or replace function public.reclasser_plantations(p_from uuid, p_to uuid, p_ids uuid[])
returns int language plpgsql set search_path = '' as $$
declare v_from public.seasons%rowtype; v_to public.seasons%rowtype; v_ids uuid[]; v_n int;
begin
  if not public.is_team_owner(p_from) or not public.is_team_owner(p_to) then
    raise exception 'Seul un propriétaire de la ferme peut rattacher des plantations à une autre saison' using errcode = '42501';
  end if;
  if p_from = p_to then raise exception 'Saisons source et cible identiques'; end if;
  select * into v_from from public.seasons where id = p_from;
  select * into v_to from public.seasons where id = p_to;
  if v_from.farm_id is distinct from v_to.farm_id then
    raise exception 'Les deux saisons doivent appartenir à la même ferme';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_ids) x where x is not null;
  if cardinality(v_ids) = 0 then return 0; end if;
  if exists (select 1 from unnest(v_ids) i
              where not exists (select 1 from public.plantings p where p.id = i and p.season_id = p_from)) then
    raise exception 'Une plantation demandée n''est pas (ou plus) dans la saison %', v_from.name;
  end if;
  if exists (select 1 from public.tasks t
              where t.season_id = p_to
                and t.auto_key in (select t2.auto_key from public.tasks t2
                                    where t2.season_id = p_from and t2.planting_id = any(v_ids) and t2.auto_key is not null)) then
    raise exception 'La saison % a déjà une tâche du plan pour une de ces plantations : rien n''a été déplacé', v_to.name;
  end if;
  update public.tasks t set season_id = p_to
   where t.season_id = p_from and t.planting_id = any(v_ids) and t.auto_key is not null;
  update public.plantings p set season_id = p_to
   where p.id = any(v_ids) and p.season_id = p_from;
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_ids) then
    raise exception 'Seules % plantations sur % ont pu être rattachées : rien n''a été déplacé', v_n, cardinality(v_ids);
  end if;
  return v_n;
end; $$;

-- ------------------------------------------------------------
-- G. Reprendre le plan d'une saison dans une saison existante
-- ------------------------------------------------------------
-- Recopie les plantations de la source, semis décalé de p_shift_years ans
-- (dates dérivées recalculées par trg_calc_planting), SAUF :
--  * vivace en place (cycle 'vivace', arrachee_le null) : elle persiste ;
--  * plantation dont la 1re récolte n'est pas dans l'année de la source
--    (elle relève d'une autre saison ; la copier la ferait glisser d'un an) ;
--  * plantation déjà prévue dans la cible : même planche, même culture,
--    semis à 60 jours près (ex. les bulbes de novembre rattachés en F).
-- Owner des deux saisons, même ferme, année cible = année source + décalage.
-- security invoker : lecture et insertions sous la RLS de l'appelant.
-- Renvoie les compteurs.
create or replace function public.reprendre_plan_dans_saison(p_source uuid, p_cible uuid, p_shift_years int default 1)
returns json language plpgsql set search_path = '' as $$
declare
  v_src public.seasons%rowtype; v_dst public.seasons%rowtype; r record; v_semis date;
  n_copiees int := 0; n_vivaces int := 0; n_deja int := 0; n_hors int := 0;
begin
  if not public.is_team_owner(p_source) or not public.is_team_owner(p_cible) then
    raise exception 'Seul le propriétaire peut reprendre un plan' using errcode = '42501';
  end if;
  select * into v_src from public.seasons where id = p_source;
  select * into v_dst from public.seasons where id = p_cible;
  if v_src.farm_id is distinct from v_dst.farm_id then
    raise exception 'Les deux saisons doivent appartenir à la même ferme';
  end if;
  if p_shift_years is null or p_shift_years < 1 or v_dst.year <> v_src.year + p_shift_years then
    raise exception 'Décalage incohérent : % + % ans ne donne pas %', v_src.year, p_shift_years, v_dst.year;
  end if;
  for r in
    select p.*, c.cycle as c_cycle, pf.date_recolte as f_recolte
      from public.plantings p
      join public.culture_catalog c on c.id = p.culture_id
      join public.plantings_full pf on pf.id = p.id
     where p.season_id = p_source
     order by p.date_semis, p.id
  loop
    if r.c_cycle = 'vivace' and r.arrachee_le is null then n_vivaces := n_vivaces + 1; continue; end if;
    if r.f_recolte is null or extract(year from r.f_recolte)::int <> v_src.year then n_hors := n_hors + 1; continue; end if;
    v_semis := (r.date_semis + make_interval(years => p_shift_years))::date;
    if exists (select 1 from public.plantings q
                where q.season_id = p_cible and q.planche_id = r.planche_id and q.culture_id = r.culture_id
                  and abs(q.date_semis - v_semis) <= 60) then
      n_deja := n_deja + 1; continue;
    end if;
    insert into public.plantings (planche_id, culture_id, season_id, surface_m2, date_semis,
      jours_cellule_override, jours_champ_override, jours_recolte_override,
      rendement_override, prix_override, notes, achat_plant)
    values (r.planche_id, r.culture_id, p_cible, r.surface_m2, v_semis,
      r.jours_cellule_override, r.jours_champ_override, r.jours_recolte_override,
      r.rendement_override, r.prix_override, r.notes, r.achat_plant);
    n_copiees := n_copiees + 1;
  end loop;
  return json_build_object('copiees', n_copiees, 'vivaces_en_place', n_vivaces, 'deja_prevues', n_deja, 'hors_annee', n_hors);
end; $$;

-- ------------------------------------------------------------
-- H. duplicate_season_plan (006) : mêmes règles que G
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
  -- trg_season_une_par_annee refuse une année déjà prise
  insert into public.seasons (user_id, farm_id, name, year, revenue_goal, is_active)
  values (auth.uid(), v_src.farm_id, p_name, p_year, v_src.revenue_goal, false)
  returning id into v_new;
  perform public.reprendre_plan_dans_saison(p_source_season, v_new, p_shift_years);
  return v_new;
end; $$;

-- ------------------------------------------------------------
-- J. Basculer une saison-plan sur l'année suivante
-- ------------------------------------------------------------
-- p_appliquer = false : aperçu seul, rien n'est écrit.
-- p_appliquer = true, dans la même transaction :
--  1. la saison prend l'année p_annee, le nom « p_annee » (ancien nom gardé
--     dans nom_initial) et donc les bornes du 1er janvier au 31 décembre ;
--  2. les plantations dont la 1re récolte tombe AVANT p_annee voient leur
--     date de semis (ou d'entrée en cellule) décalée de (p_annee - année)
--     ans ; le trigger recalcule les autres dates ;
--  3. celles dont la 1re récolte est déjà en p_annee (ou après) restent ;
--  4. une vivace en place (arrachee_le null) déjà plantée (plantation au
--     plus tard aujourd'hui, heure de Paris) reste : elle refleurit sans
--     replantation ; une vivace pas encore plantée se décale ;
--  5. une plantation sans date de récolte calculable reste, et est listée ;
--  6. ventes, commandes, bons, récoltes, tâches, coûts : rien n'est touché.
-- Owner seulement ; security invoker : les UPDATE passent par la RLS, et
-- si elle en écarte une ligne, le compte ne tombe pas juste et tout est
-- annulé. trg_season_une_par_annee refuse une année déjà prise.
create or replace function public.basculer_saison(p_season uuid, p_annee int, p_appliquer boolean default false)
returns json language plpgsql set search_path = '' as $$
declare
  v_s public.seasons%rowtype;
  v_auj date := (now() at time zone 'Europe/Paris')::date;
  v_decal int; v_decalees json; v_laissees json; v_n int;
begin
  if not public.is_team_owner(p_season) then
    raise exception 'Seul un propriétaire de la ferme peut changer l''année d''une saison' using errcode = '42501';
  end if;
  select * into v_s from public.seasons where id = p_season;
  if not found then raise exception 'Saison introuvable'; end if;
  if p_annee is null or p_annee <= v_s.year or p_annee > 2100 then
    raise exception 'L''année cible (%) doit suivre l''année de la saison (%)', p_annee, v_s.year;
  end if;
  v_decal := p_annee - v_s.year;

  with base as (
    select pf.id, pf.culture_name, pf.planche_name, pf.garden_name, pf.date_semis, pf.date_plantation, pf.date_recolte,
           p.arrachee_le, c.cycle
      from public.plantings_full pf
      join public.plantings p on p.id = pf.id
      join public.culture_catalog c on c.id = pf.culture_id
     where pf.season_id = p_season
  ), classe as (
    select b.*,
      case
        when b.cycle = 'vivace' and b.arrachee_le is null and b.date_plantation <= v_auj then 'vivace_en_place'
        when b.date_recolte is null then 'recolte_non_calculable'
        when extract(year from b.date_recolte)::int >= p_annee then 'deja_annee_cible'
        else 'a_decaler'
      end as statut
    from base b
  )
  select
    coalesce(json_agg(json_build_object(
      'planting_id', id, 'culture_name', culture_name, 'planche_name', planche_name, 'garden_name', garden_name,
      'date_semis', date_semis, 'nouvelle_date_semis', (date_semis + make_interval(years => v_decal))::date,
      'date_recolte', date_recolte) order by date_semis, culture_name) filter (where statut = 'a_decaler'), '[]'::json),
    coalesce(json_agg(json_build_object(
      'planting_id', id, 'culture_name', culture_name, 'planche_name', planche_name, 'garden_name', garden_name,
      'date_semis', date_semis, 'date_recolte', date_recolte, 'raison', statut) order by date_semis, culture_name)
      filter (where statut <> 'a_decaler'), '[]'::json)
  into v_decalees, v_laissees
  from classe;

  if p_appliquer then
    update public.seasons
       set nom_initial = coalesce(nom_initial, case when name is distinct from p_annee::text then name end),
           name = p_annee::text, year = p_annee
     where id = p_season;
    update public.plantings p
       set date_semis = (p.date_semis + make_interval(years => v_decal))::date
     where p.season_id = p_season
       and p.id in (select (x->>'planting_id')::uuid from json_array_elements(v_decalees) x);
    get diagnostics v_n = row_count;
    if v_n <> json_array_length(v_decalees) then
      raise exception 'Seules % plantations sur % ont pu être décalées : rien n''a été changé', v_n, json_array_length(v_decalees);
    end if;
  end if;

  return json_build_object(
    'applique', p_appliquer,
    'saison', json_build_object('id', p_season, 'ancien_nom', v_s.name, 'ancienne_annee', v_s.year,
      'nouveau_nom', p_annee::text, 'annee', p_annee, 'date_debut', make_date(p_annee, 1, 1), 'date_fin', make_date(p_annee, 12, 31)),
    'decalees', v_decalees,
    'laissees', v_laissees);
end; $$;

-- ------------------------------------------------------------
-- I. Droits
-- ------------------------------------------------------------
revoke execute on function public.season_une_par_annee() from public, anon, authenticated;
revoke execute on function
  public.plantations_hors_annee_de_recolte(uuid),
  public.reclasser_plantations(uuid, uuid, uuid[]),
  public.reprendre_plan_dans_saison(uuid, uuid, int),
  public.basculer_saison(uuid, int, boolean)
from public, anon;
grant execute on function
  public.plantations_hors_annee_de_recolte(uuid),
  public.reclasser_plantations(uuid, uuid, uuid[]),
  public.reprendre_plan_dans_saison(uuid, uuid, int),
  public.basculer_saison(uuid, int, boolean)
to authenticated;

-- RLS : aucune table créée ; seasons, plantings et tasks gardent leurs
-- policies (004, 005, 006). Les nouvelles colonnes de seasons sont couvertes
-- par la policy de lecture existante. E, F, G et J s'exécutent avec les
-- droits de l'appelant (RLS) et vérifient en plus owner et ferme ; seul H
-- (duplicate_season_plan, déjà security definer en 006) garde ce mode.

-- ============================================================
-- -- down (réversible ; aucune donnée perdue : les noms d'origine reviennent
-- -- de nom_initial ; les rattachements faits par F, les copies faites par
-- -- G et les décalages faits par J restent des lignes valides en 006 ; une
-- -- saison basculée par J garde son année : remettre year à la main si voulu)
-- ============================================================
-- update public.seasons set name = nom_initial where nom_initial is not null;
-- create or replace function public.duplicate_season_plan(p_source_season uuid, p_name text, p_year int, p_shift_years int default 1)
-- returns uuid language plpgsql security definer set search_path = '' as $f$
-- declare v_src public.seasons%rowtype; v_new uuid;
-- begin
--   if not public.is_team_owner(p_source_season) then raise exception 'Seul le propriétaire peut dupliquer un plan'; end if;
--   select * into v_src from public.seasons where id = p_source_season;
--   insert into public.seasons (user_id, farm_id, name, year, revenue_goal, is_active)
--   values (auth.uid(), v_src.farm_id, p_name, p_year, v_src.revenue_goal, false) returning id into v_new;
--   insert into public.plantings (planche_id, culture_id, season_id, surface_m2, date_semis, jours_cellule_override, jours_champ_override, jours_recolte_override, rendement_override, prix_override, notes)
--   select planche_id, culture_id, v_new, surface_m2, (date_semis + make_interval(years => p_shift_years))::date, jours_cellule_override, jours_champ_override, jours_recolte_override, rendement_override, prix_override, notes
--   from public.plantings where season_id = p_source_season;
--   return v_new;
-- end; $f$;
-- drop function if exists public.basculer_saison(uuid, int, boolean);
-- drop function if exists public.reprendre_plan_dans_saison(uuid, uuid, int);
-- drop function if exists public.reclasser_plantations(uuid, uuid, uuid[]);
-- drop function if exists public.plantations_hors_annee_de_recolte(uuid);
-- drop trigger if exists trg_season_une_par_annee on public.seasons;
-- drop function if exists public.season_une_par_annee();
-- alter table public.seasons drop column if exists nom_initial;
-- alter table public.seasons drop constraint if exists seasons_annee_civile_check;
-- alter table public.seasons drop column if exists date_fin, drop column if exists date_debut;
-- comment on column public.seasons.year is null;
