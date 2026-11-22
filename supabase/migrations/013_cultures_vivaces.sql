-- ============================================================
-- MIGRATION 013 : cultures annuelles, bisannuelles et vivaces
-- ============================================================
-- Retours de Marine (22/11/2026) :
--  * un critère annuelle / bisannuelle / vivace au catalogue ;
--  * une vivace occupe sa planche d'une année sur l'autre, jusqu'à son
--    arrachage, et fleurit chaque année dans sa fenêtre de récolte ;
--  * « 1ère date d'implantation possible » de sa charte (jj/mm) ;
--  * OPTION PLANT de son tableur : plant acheté, pas de passage en cellule,
--    la date saisie EST la date de plantation ;
--  * les cycles « étirés » (Achillée 30/335/15 = 380 j, Ancolie 0/365/10…)
--    étaient un artifice pour simuler une vivace : on les marque vivaces.
--
-- Modèle (sans dupliquer la ligne chaque année) :
--  * `culture_catalog.cycle` ; `jours_champ` d'une vivace = délai entre la
--    plantation et la PREMIÈRE floraison (≤ 365 j) ;
--    `annees_avant_recolte` = années supplémentaires avant cette première
--    floraison (pivoine « 3 ans » dans la charte), 0 par défaut ;
--  * `plantings.date_recolte` / `date_fin` = première fenêtre de récolte,
--    comme avant (rétrocompatible). La fenêtre se répète chaque année à la
--    même date tant que la vivace est en place (calcul côté domaine :
--    `fenetresRecolte`) ;
--  * `floraison_debut` (jj/mm, vivace ou bisannuelle) : jour de l'année où
--    commence la récolte. S'il est renseigné, la première récolte est la
--    première occurrence de ce jour après plantation + jours_champ (+ années) :
--    une achillée plantée en mars fleurit dans SA fenêtre, pas « 335 jours
--    plus tard » en mars. La charte n'a pas cette donnée : vide à la
--    migration, l'écran Catalogue la signale « à renseigner » et, en
--    attendant, la récolte suit la méthode du tableur (jours au champ) ;
--  * jours en cellule / au champ / de récolte alignés sur la charte de
--    Marine quand elle a la valeur ; chaque changement est tracé dans
--    `culture_catalog_corrections_013` (avant → après, sert aussi au down) ;
--  * occupation de la planche : de la plantation à `arrachee_le` (inclus) ;
--    une vivace sans `arrachee_le` est toujours en place
--    (`plantings_full.fin_occupation` = null). Une annuelle arrachée avant
--    sa fin de récolte libère la planche plus tôt.
--
-- RLS : aucune table nouvelle, policies de 004 / 006 inchangées
-- (« plantations : membres », « catalogue : … »). La vue reste en
-- security_invoker.
-- Réversible : bloc « down » commenté en fin de fichier.
-- ============================================================

-- ------------------------------------------------------------
-- A. Catalogue
-- ------------------------------------------------------------
alter table public.culture_catalog
  add column cycle text not null default 'annuelle',
  add column premiere_implantation text,
  add column annees_avant_recolte int not null default 0,
  add column floraison_debut text;

alter table public.culture_catalog
  add constraint culture_catalog_cycle_check
    check (cycle in ('annuelle', 'bisannuelle', 'vivace')),
  -- jj/mm, jour existant (29/02 accepté : année bissextile possible)
  add constraint culture_catalog_premiere_implantation_check
    check (premiere_implantation is null or premiere_implantation ~
      '^((0[1-9]|1[0-9]|2[0-9])/(0[1-9]|1[0-2])|30/(0[13-9]|1[0-2])|31/(0[13578]|1[02]))$'),
  add constraint culture_catalog_annees_avant_recolte_check
    check (annees_avant_recolte between 0 and 10 and (annees_avant_recolte = 0 or cycle = 'vivace')),
  add constraint culture_catalog_floraison_debut_check
    check (floraison_debut is null or (cycle <> 'annuelle' and floraison_debut ~
      '^((0[1-9]|1[0-9]|2[0-9])/(0[1-9]|1[0-2])|30/(0[13-9]|1[0-2])|31/(0[13578]|1[02]))$'));

comment on column public.culture_catalog.cycle is
  'annuelle | bisannuelle | vivace. Une vivace occupe sa planche jusqu''à arrachage et fleurit chaque année.';
comment on column public.culture_catalog.premiere_implantation is
  '1ère date d''implantation au champ possible, jj/mm (charte de Marine, dernier gel au sol au 21 mai).';
comment on column public.culture_catalog.floraison_debut is
  'Vivace ou bisannuelle : début de la récolte chaque année, jj/mm. Null = récolte à plantation + jours_champ (méthode du tableur).';
comment on column public.culture_catalog.annees_avant_recolte is
  'Vivace : années supplémentaires avant la première floraison (pivoine). 0 = floraison jours_champ après plantation.';

-- ------------------------------------------------------------
-- B. Plantations
-- ------------------------------------------------------------
alter table public.plantings
  add column achat_plant boolean not null default false,
  add column arrachee_le date;

alter table public.plantings
  add constraint plantings_arrachee_le_check
    check (arrachee_le is null or arrachee_le >= date_semis);

comment on column public.plantings.achat_plant is
  'OPTION PLANT : plant acheté, pas de passage en cellule. date_semis porte alors la date de plantation.';
comment on column public.plantings.arrachee_le is
  'Dernier jour en place (arrachage). Null : vivace toujours en place, annuelle jusqu''à date_fin.';

-- ------------------------------------------------------------
-- C0. Première date >= p_date tombant le jj/mm donné (29/02 → 28/02 les
--     années non bissextiles). Pure ; utilisée par le trigger et la vue.
-- ------------------------------------------------------------
create or replace function public.prochaine_date_jjmm(p_date date, p_jjmm text)
returns date language plpgsql immutable set search_path = '' as $$
declare
  j int := split_part(p_jjmm, '/', 1)::int;
  m int := split_part(p_jjmm, '/', 2)::int;
  a int := extract(year from p_date)::int;
  d date;
begin
  if p_date is null or p_jjmm is null then return null; end if;
  for k in 0..1 loop
    d := make_date(a + k, m, 1);
    d := d + (least(j, extract(day from (d + interval '1 month - 1 day'))::int) - 1);
    if d >= p_date then return d; end if;
  end loop;
  return d;
end; $$;
revoke execute on function public.prochaine_date_jjmm(date, text) from public, anon;
grant execute on function public.prochaine_date_jjmm(date, text) to authenticated;

-- ------------------------------------------------------------
-- C. Trigger de calcul des dates (remplace 002, search_path de 004)
-- ------------------------------------------------------------
create or replace function public.calc_planting_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cat record;
  j_cellule int;
  j_champ int;
  j_recolte int;
  annees int;
  rend numeric;
  prix numeric;
  espacement numeric;
  plants int;
begin
  select * into cat from public.culture_catalog where id = new.culture_id;

  -- Plant acheté : pas de cellule, la date saisie est la plantation
  j_cellule := case when new.achat_plant then 0
                    else coalesce(nullif(new.jours_cellule_override, 0), cat.jours_cellule, 0) end;
  j_champ   := coalesce(new.jours_champ_override, cat.jours_champ);
  j_recolte := coalesce(new.jours_recolte_override, cat.jours_recolte, 21);
  annees    := case when cat.cycle = 'vivace' then coalesce(cat.annees_avant_recolte, 0) else 0 end;
  rend      := coalesce(new.rendement_override, cat.rendement_plant, 1);
  prix      := coalesce(new.prix_override, cat.prix_tige, 0.50);
  espacement := coalesce(cat.espacement_cm, 20);

  -- Première fenêtre de récolte ; pour une vivace elle se répète chaque année.
  -- Vivace / bisannuelle avec floraison_debut : calée sur sa fenêtre annuelle.
  new.date_plantation := new.date_semis + j_cellule;
  new.date_recolte    := ((new.date_plantation + j_champ) + make_interval(years => annees))::date;
  if cat.cycle <> 'annuelle' and cat.floraison_debut is not null then
    new.date_recolte := public.prochaine_date_jjmm(new.date_recolte, cat.floraison_debut);
  end if;
  new.date_fin        := new.date_recolte + j_recolte;

  plants := greatest(1, floor(new.surface_m2 * 10000 / (espacement * espacement)));
  if plants > new.surface_m2 * 50 then plants := (new.surface_m2 * 25)::int; end if;

  new.plants_count       := plants;
  new.tiges_estimees     := round(plants * rend * 0.7, 0);
  new.revenu_estime      := round(new.tiges_estimees * prix, 2);
  -- Plant acheté : aucune graine à semer (ce n'est pas une donnée manquante)
  new.graines_necessaires := case when new.achat_plant then 0
                                  else ceil(plants * 1.3 * coalesce(cat.graines_par_plant, 1)) end;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- D. Vue plantings_full : colonnes existantes inchangées (noms, types,
--    ordre), nouvelles colonnes ajoutées à la fin.
-- ------------------------------------------------------------
create or replace view public.plantings_full with (security_invoker = true) as
with b as (
  select p.*,
    c.name as c_name, c.type as c_type, c.cycle as c_cycle,
    c.premiere_implantation as c_premiere_implantation, c.floraison_debut as c_floraison_debut,
    c.temp_germination as c_temp_germination, c.pincer as c_pincer, c.filet as c_filet,
    c.couvre_sol as c_couvre_sol, c.semis_direct as c_semis_direct, c.espacement_cm as c_espacement_cm,
    c.rangs_par_planche as c_rangs_par_planche, c.graines_par_plant as c_graines_par_plant,
    c.rendement_plant as c_rendement_plant, c.prix_tige as c_prix_tige,
    case when p.achat_plant then 0
         else coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0) end as v_cellule,
    coalesce(p.jours_champ_override, c.jours_champ) as v_champ,
    coalesce(p.jours_recolte_override, c.jours_recolte, 21) as v_recolte,
    case when c.cycle = 'vivace' then coalesce(c.annees_avant_recolte, 0) else 0 end as v_annees
  from public.plantings p
  join public.culture_catalog c on c.id = p.culture_id
), d as (
  select b.*,
    (b.date_semis + b.v_cellule) as v_plantation,
    case when b.c_cycle <> 'annuelle' and b.c_floraison_debut is not null
         then public.prochaine_date_jjmm((((b.date_semis + b.v_cellule) + b.v_champ) + make_interval(years => b.v_annees))::date, b.c_floraison_debut)
         else (((b.date_semis + b.v_cellule) + b.v_champ) + make_interval(years => b.v_annees))::date end as v_date_recolte
  from b
)
select d.id, d.planche_id, d.culture_id, d.season_id, d.surface_m2, d.date_semis,
  d.v_plantation as date_plantation,
  d.v_date_recolte as date_recolte,
  (d.v_date_recolte + d.v_recolte) as date_fin,
  d.plants_count, d.tiges_estimees, d.revenu_estime, d.graines_necessaires,
  d.jours_cellule_override, d.jours_champ_override, d.jours_recolte_override,
  d.rendement_override, d.prix_override,
  d.surface_m2 as planting_m2, d.notes as planting_notes,
  d.c_name as culture_name, d.c_type as culture_type,
  d.v_cellule as jours_cellule,
  d.v_champ as jours_champ,
  d.v_recolte as jours_recolte,
  coalesce(d.rendement_override, d.c_rendement_plant) as rendement,
  coalesce(d.prix_override, d.c_prix_tige) as prix_tige,
  d.c_temp_germination as temp_germination, d.c_pincer as pincer, d.c_filet as filet,
  d.c_couvre_sol as couvre_sol, d.c_semis_direct as semis_direct,
  d.c_espacement_cm as espacement_cm, d.c_rangs_par_planche as rangs_par_planche,
  d.c_graines_par_plant as graines_par_plant,
  pl.name as planche_name, pl.surface_m2 as planche_m2,
  g.name as garden_name, g.id as garden_id, g.surface_m2 as garden_m2,
  s.user_id,
  g.farm_id, s.name as season_name, s.year as season_year,
  -- 013
  d.c_cycle as cycle,
  d.achat_plant,
  d.arrachee_le,
  d.v_annees as annees_avant_recolte,
  d.c_premiere_implantation as premiere_implantation,
  d.c_floraison_debut as floraison_debut,
  -- Dernier jour d'occupation de la planche ; null = vivace toujours en place
  case when d.arrachee_le is not null then d.arrachee_le
       when d.c_cycle = 'vivace' then null
       else d.v_date_recolte + d.v_recolte end as fin_occupation
from d
join public.planches pl on pl.id = d.planche_id
join public.gardens g on g.id = pl.garden_id
join public.seasons s on s.id = d.season_id;

revoke all on public.plantings_full from anon;
grant select on public.plantings_full to authenticated;

-- ------------------------------------------------------------
-- E. Dupliquer un plan : une vivace en place ne se replante pas
--    (même corps qu'en 006, plus le filtre et l'option plant).
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
  insert into public.plantings (planche_id, culture_id, season_id, surface_m2, date_semis,
    jours_cellule_override, jours_champ_override, jours_recolte_override,
    rendement_override, prix_override, notes, achat_plant)
  select p.planche_id, p.culture_id, v_new, p.surface_m2, (p.date_semis + make_interval(years => p_shift_years))::date,
    p.jours_cellule_override, p.jours_champ_override, p.jours_recolte_override,
    p.rendement_override, p.prix_override, p.notes, p.achat_plant
  from public.plantings p
  join public.culture_catalog c on c.id = p.culture_id
  where p.season_id = p_source_season
    and c.cycle <> 'vivace';
  return v_new;
end; $$;

-- ------------------------------------------------------------
-- F. Données : cycles « étirés » de la charte → vivaces / bisannuelles
--    Liste de la charte « Vivace (zone 5) » + pivoine + véronique.
--    Nom comparé sans casse ni accents.
-- ------------------------------------------------------------
create temporary table _cv_motifs (motif text primary key, cycle text not null);
insert into _cv_motifs values
  ('ancolie%', 'vivace'),
  ('lupin%', 'vivace'),
  ('rudbeck%', 'vivace'),
  ('achillee%', 'vivace'),
  ('asclepiade%', 'vivace'),
  ('monarde%', 'vivace'),
  ('scabieuse%fama%', 'vivace'),
  ('eremurus%', 'vivace'),
  ('eringium%', 'vivace'),
  ('eryngium%', 'vivace'),
  ('pivoine%', 'vivace'),
  ('veronique%', 'vivace'),
  ('lunaire%', 'bisannuelle');

-- Normalisation sans extension unaccent
create or replace function pg_temp.cv_norm(t text) returns text language sql immutable as $$
  select translate(lower(btrim(t)), 'àâäáãéèêëíìîïóòôöõúùûüçñœ', 'aaaaaeeeeiiiiooooouuuucno')
$$;

update public.culture_catalog c
   set cycle = m.cycle
  from _cv_motifs m
 where pg_temp.cv_norm(c.name) like m.motif;

-- Digitale non F1 : bisannuelle ; Digitale F1 reste annuelle (70 j au champ)
update public.culture_catalog
   set cycle = 'bisannuelle'
 where pg_temp.cv_norm(name) like 'digitale%'
   and pg_temp.cv_norm(name) not like '%f1%';

-- ------------------------------------------------------------
-- F2. Jours en cellule / au champ / de récolte : alignés sur la charte
--     (onglet « Chartes des cultures », colonnes M, L, N), ligne par ligne,
--     quand la charte a la valeur. Nom comparé sans casse ni accents, sur
--     le nom complet ou sur le nom avant la parenthèse. Une clé que la
--     charte donne deux fois avec des valeurs différentes (Gomphrena,
--     Lavatère, Gypsophile) n'est pas appliquée. Pivoine : « 3 ans » au
--     champ, traité plus bas. Chaque changement est tracé.
-- ------------------------------------------------------------
create table public.culture_catalog_corrections_013 (
  id bigint generated always as identity primary key,
  culture_id uuid not null references public.culture_catalog(id) on delete cascade,
  user_id uuid,
  culture_name text not null,
  champ text not null check (champ in ('jours_cellule', 'jours_champ', 'jours_recolte')),
  avant int,
  apres int,
  source text not null,
  corrige_le timestamptz not null default now()
);
comment on table public.culture_catalog_corrections_013 is
  'Valeurs du catalogue changées par la migration 013 (charte de Marine), avant → après. Lecture seule ; sert au down.';
alter table public.culture_catalog_corrections_013 enable row level security;
-- Lecture : mêmes règles que le catalogue. Aucune écriture par l'API.
create policy "corrections 013 : lecture équipe" on public.culture_catalog_corrections_013
  for select to authenticated using (user_id is null or user_id in (select public.my_teammate_ids()));
revoke all on public.culture_catalog_corrections_013 from anon;
revoke insert, update, delete, truncate on public.culture_catalog_corrections_013 from authenticated;
grant select on public.culture_catalog_corrections_013 to authenticated;

create temporary table _cv_charte (cle text primary key, jc int, jch int, jr int);
insert into _cv_charte (cle, jc, jch, jr) values
  ('amarante', 25, 55, 21), ('ammi', 25, 50, 21), ('ancolie', 0, 365, 21), ('calendule', 0, 55, 21),
  ('celosie a plumes', 23, 72, 21), ('centauree aloha', 25, 65, 21), ('cloches d''irlande', 30, 70, 21),
  ('delphinium ou pied d''alouette', 30, 70, 21), ('delphinium', 30, 70, 21), ('pied d''alouette', 30, 70, 21),
  ('geranium', 0, 120, 21), ('lupin', 25, 335, 21), ('matricaire', 30, 70, 21), ('orlaya', 30, 40, 21),
  ('pivoine', 0, null, 21), ('rudbeckie', 37, 83, 21), ('rudbeckia', 37, 83, 21), ('statice', 30, 80, 21),
  ('talinum', 30, 70, 21), ('achillee', 30, 335, 21), ('ageratum', 30, 60, 21), ('anemone', 0, 120, 56),
  ('asclepiade', 30, 100, 21), ('centauree (centaurea cyanus) bleuet', 25, 45, 21), ('centauree bleuet', 25, 45, 21),
  ('bleuet', 25, 45, 21), ('cerinthe', 25, 45, 21), ('cobea', 23, 97, 21), ('digitale', 45, 320, 21),
  ('digitale f1', 30, 70, 21), ('craspedia', 30, 80, 21), ('dahlia', 0, 90, 75), ('dianthus', 30, 70, 21),
  ('didiscus', 25, 75, 21), ('hibiscus', 30, 85, 21), ('mignonette', 30, 40, 21), ('monarde', 30, 80, 21),
  ('myosotis chinois', 25, 60, 21), ('myosotis', 25, 60, 21), ('nicotine', 23, 57, 21), ('nielle', 30, 50, 21),
  ('pavot d''islande', 30, 70, 21), ('petite vigne ballon', 20, 100, 21), ('phlox', 25, 55, 21),
  ('pois de senteur avec feuillage', 20, 70, 21), ('pois de senteur', 20, 70, 21), ('renoncule', 0, 120, 56),
  ('scabieuse', 30, 60, 21), ('scabieuse fama', 30, 270, 21), ('tagete ou oeillet d''inde', 25, 65, 21),
  ('tagete', 25, 65, 21), ('zinnia', 23, 67, 21), ('aneth', 0, 105, 21), ('aster de chine', 35, 60, 21),
  ('aster', 35, 60, 21), ('buplevre', 30, 55, 21), ('campanule', 30, 70, 21), ('celosie cretes de coq', 23, 77, 21),
  ('chou ornamental', 23, 67, 21), ('chou ornemental', 23, 67, 21), ('cineraire', 25, 65, 21),
  ('cresson', 0, 75, 21), ('dauphinelle', 25, 65, 21), ('eremurus', 0, 365, 21), ('eringium', 30, 335, 21),
  ('eryngium', 30, 335, 21), ('eucalyptus', 30, 90, 21), ('giroflee', 25, 65, 21), ('godetie', 25, 50, 21),
  ('immortelle', 30, 60, 21), ('lin', 0, 60, 21), ('lisianthus', 75, 90, 21), ('lunaire', 30, 330, 21),
  ('lys en terre', 0, 110, 21), ('lys', 0, 110, 21), ('muflier', 30, 70, 21), ('nigelle', 0, 70, 21),
  ('pansee', 30, 50, 21), ('pensee', 30, 50, 21), ('pavot fruit', 30, 70, 21), ('saponaire', 0, 75, 21),
  ('soupir de bebe', 25, 50, 21), ('tournesol', 0, 65, 21), ('tulipe', 0, 120, 56), ('prairie fleurie', 0, 60, 21),
  ('acroclinium', 25, 60, 21), ('ammobium', 25, 60, 21), ('basilic', 25, 60, 21), ('briza maxima', 25, 60, 21),
  ('carotte sauvage', 25, 60, 21), ('carthamus', 25, 60, 21), ('carthame', 25, 60, 21), ('chrysantheme', 25, 60, 21),
  ('cosmos', 25, 60, 21), ('gypso', 25, 60, 21), ('lagarus', 25, 60, 21), ('lonas', 25, 60, 21),
  ('menthe', 25, 60, 21), ('panicum', 25, 60, 21), ('ruscus', 25, 60, 21), ('sauge', 25, 60, 21),
  ('shizo', 25, 60, 21), ('origan', 25, 60, 21), ('helenium', 25, 60, 21), ('clarkia unguiculata', 25, 60, 21),
  ('clarkia', 25, 60, 21), ('soleil du mexique', 21, 60, 21), ('marguerite sauvage', 0, 60, 21);

create temporary table _cv_cible as
select distinct on (c.id) c.id, c.user_id, c.name, ch.jc, ch.jch, ch.jr,
       c.jours_cellule as a_jc, c.jours_champ as a_jch, c.jours_recolte as a_jr
  from public.culture_catalog c
  join _cv_charte ch
    on ch.cle = pg_temp.cv_norm(c.name)
    or ch.cle = pg_temp.cv_norm(regexp_replace(c.name, '\s*\(.*$', ''))
 -- nom complet d'abord (« Digitale F1 » avant « Digitale »)
 order by c.id, (ch.cle = pg_temp.cv_norm(c.name)) desc;

insert into public.culture_catalog_corrections_013 (culture_id, user_id, culture_name, champ, avant, apres, source)
select id, user_id, name, 'jours_cellule', a_jc, jc, 'charte' from _cv_cible where jc is not null and a_jc is distinct from jc
union all
select id, user_id, name, 'jours_champ', a_jch, jch, 'charte' from _cv_cible where jch is not null and a_jch is distinct from jch
union all
select id, user_id, name, 'jours_recolte', a_jr, jr, 'charte' from _cv_cible where jr is not null and a_jr is distinct from jr;

update public.culture_catalog c
   set jours_cellule = coalesce(t.jc, c.jours_cellule),
       jours_champ   = coalesce(t.jch, c.jours_champ),
       jours_recolte = coalesce(t.jr, c.jours_recolte)
  from _cv_cible t
 where t.id = c.id
   and (t.jc is distinct from c.jours_cellule and t.jc is not null
     or t.jch is distinct from c.jours_champ and t.jch is not null
     or t.jr is distinct from c.jours_recolte and t.jr is not null);

-- Pivoine « 3 ans » : un jours_champ saisi en jours au-delà d'un an devient
-- des années entières + un reste en jours (même date de première floraison,
-- à un jour près les années bissextiles). Aucune valeur inventée.
insert into public.culture_catalog_corrections_013 (culture_id, user_id, culture_name, champ, avant, apres, source)
select id, user_id, name, 'jours_champ', jours_champ, jours_champ % 365, 'années avant récolte : ' || least(10, jours_champ / 365)
  from public.culture_catalog where cycle = 'vivace' and jours_champ > 365;
update public.culture_catalog
   set annees_avant_recolte = least(10, jours_champ / 365),
       jours_champ = jours_champ % 365
 where cycle = 'vivace' and jours_champ > 365;

-- ------------------------------------------------------------
-- G. Données : 1ère date d'implantation possible (charte, colonne Q)
--    Appliquée seulement si un seul motif correspond et si la valeur est
--    vide. Cultures sans date dans la charte (vivaces, anémone, renoncule,
--    tulipe, Digitale non F1…) : laissées vides.
-- ------------------------------------------------------------
create temporary table _cv_implantation (motif text primary key, jjmm text not null);
insert into _cv_implantation values
  ('amarant%', '28/05'), ('ammi%', '21/05'), ('calendul%', '21/05'),
  ('celosie%', '29/05'), ('centauree aloha%', '21/05'), ('cloches d''irlande%', '01/04'),
  ('delphinium%', '01/04'), ('pied d''alouette%', '01/04'), ('geranium%', '21/05'),
  ('gomphren%', '21/05'), ('matricaire%', '01/04'), ('orlaya%', '15/05'), ('statice%', '01/04'),
  ('talinum%', '21/05'), ('ageratum%', '21/05'), ('asclepiade%', '21/05'),
  ('centauree%bleuet%', '15/05'), ('bleuet%', '15/05'), ('cerinthe%', '15/04'), ('cobea%', '21/05'),
  ('digitale%f1%', '01/04'), ('craspedia%', '21/05'), ('dahlia%', '15/05'), ('dianthus%', '01/04'),
  ('didiscus%', '01/04'), ('hibiscus%', '21/05'), ('lavatere%', '21/05'), ('mignonette%', '15/05'),
  ('monarde%', '21/05'), ('myosotis%', '21/05'), ('nicotine%', '21/05'), ('nielle%', '01/04'),
  ('pavot%', '15/04'), ('petite vigne ballon%', '21/05'), ('phlox%', '21/05'),
  ('pois de senteur%', '15/04'), ('tagete%', '21/05'), ('zinnia%', '21/05'), ('aneth%', '14/05'),
  ('aster%', '21/05'), ('buplevre%', '15/04'), ('campanule%', '21/05'), ('chou%', '15/04'),
  ('cineraire%', '21/05'), ('cresson%', '01/04'), ('dauphinelle%', '01/04'), ('eucalyptus%', '21/05'),
  ('giroflee%', '15/04'), ('godetie%', '01/04'), ('immortelle%', '21/05'), ('lin%', '21/05'),
  ('lisianthus%', '21/05'), ('lys%', '21/05'), ('muflier%', '01/04'), ('nigelle%', '01/04'),
  ('pensee%', '21/05'), ('pansee%', '21/05'), ('saponaire%', '21/05'), ('soupir de bebe%', '21/05'),
  ('tournesol%', '21/05'), ('prairie fleurie%', '21/05'), ('cosmos%', '21/05'), ('helenium%', '01/04'),
  ('clarkia%', '01/04'), ('soleil du mexique%', '21/05'), ('marguerite sauvage%', '21/05');
-- « Scabieuse » annuelle (01/04) mais pas « Scabieuse Fama » (vivace, pas de date)
insert into _cv_implantation values ('scabieuse', '01/04'), ('scabieuse (scabiosa)%', '01/04');

with cand as (
  select c.id, min(i.jjmm) as jjmm, count(*) as n
    from public.culture_catalog c
    join _cv_implantation i on pg_temp.cv_norm(c.name) like i.motif
   where c.premiere_implantation is null
   group by c.id
)
update public.culture_catalog c
   set premiere_implantation = cand.jjmm
  from cand
 where cand.id = c.id and cand.n = 1;

-- ------------------------------------------------------------
-- H. Garde-fou des cycles, posé APRÈS la correction des données.
--    NOT VALID : une ligne ancienne non reconnue par les motifs ne bloque
--    pas la migration, mais toute modification devra respecter la règle
--    (l'écran Catalogue affiche la même règle avant d'enregistrer).
--    Délai avant floraison ≤ 365 j pour tous ; cycle complet ≤ 365 j pour
--    une annuelle ; fenêtre de récolte ≤ 365 j.
-- ------------------------------------------------------------
alter table public.culture_catalog
  add constraint culture_catalog_cycle_365_check check (
    coalesce(jours_cellule, 0) + jours_champ <= 365
    and coalesce(jours_recolte, 21) <= 365
    and (cycle <> 'annuelle' or coalesce(jours_cellule, 0) + jours_champ + coalesce(jours_recolte, 21) <= 365)
  ) not valid;

-- Recalcul des plantations existantes (dates, graines) avec le nouveau trigger
update public.plantings set date_semis = date_semis;

drop table _cv_motifs;
drop table _cv_implantation;
drop table _cv_charte;
drop table _cv_cible;
drop function pg_temp.cv_norm(text);

-- ============================================================
-- -- down (à exécuter manuellement pour annuler 013)
-- ============================================================
-- begin;
-- -- Vue : retour à la définition de 006 (les colonnes ajoutées disparaissent)
-- drop view public.plantings_full;
-- create view public.plantings_full with (security_invoker = true) as
-- select p.id, p.planche_id, p.culture_id, p.season_id, p.surface_m2, p.date_semis,
--   (p.date_semis + coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0)) as date_plantation,
--   ((p.date_semis + coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0)) + coalesce(p.jours_champ_override, c.jours_champ)) as date_recolte,
--   (((p.date_semis + coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0)) + coalesce(p.jours_champ_override, c.jours_champ)) + coalesce(p.jours_recolte_override, c.jours_recolte, 21)) as date_fin,
--   p.plants_count, p.tiges_estimees, p.revenu_estime, p.graines_necessaires,
--   p.jours_cellule_override, p.jours_champ_override, p.jours_recolte_override,
--   p.rendement_override, p.prix_override,
--   p.surface_m2 as planting_m2, p.notes as planting_notes,
--   c.name as culture_name, c.type as culture_type,
--   coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0) as jours_cellule,
--   coalesce(p.jours_champ_override, c.jours_champ) as jours_champ,
--   coalesce(p.jours_recolte_override, c.jours_recolte, 21) as jours_recolte,
--   coalesce(p.rendement_override, c.rendement_plant) as rendement,
--   coalesce(p.prix_override, c.prix_tige) as prix_tige,
--   c.temp_germination, c.pincer, c.filet, c.couvre_sol, c.semis_direct,
--   c.espacement_cm, c.rangs_par_planche, c.graines_par_plant,
--   pl.name as planche_name, pl.surface_m2 as planche_m2,
--   g.name as garden_name, g.id as garden_id, g.surface_m2 as garden_m2,
--   s.user_id,
--   g.farm_id, s.name as season_name, s.year as season_year
-- from public.plantings p
-- join public.culture_catalog c on c.id = p.culture_id
-- join public.planches pl on pl.id = p.planche_id
-- join public.gardens g on g.id = pl.garden_id
-- join public.seasons s on s.id = p.season_id;
-- revoke all on public.plantings_full from anon;
-- grant select on public.plantings_full to authenticated;
--
-- -- Trigger : corps de 002 (sans option plant ni années de vivace)
-- create or replace function public.calc_planting_dates()
-- returns trigger language plpgsql set search_path = '' as $$
-- declare cat record; j_cellule int; j_champ int; j_recolte int;
--   rend numeric; prix numeric; espacement numeric; plants int;
-- begin
--   select * into cat from public.culture_catalog where id = new.culture_id;
--   j_cellule := coalesce(nullif(new.jours_cellule_override, 0), cat.jours_cellule, 0);
--   j_champ   := coalesce(new.jours_champ_override, cat.jours_champ);
--   j_recolte := coalesce(new.jours_recolte_override, cat.jours_recolte, 21);
--   rend      := coalesce(new.rendement_override, cat.rendement_plant, 1);
--   prix      := coalesce(new.prix_override, cat.prix_tige, 0.50);
--   espacement := coalesce(cat.espacement_cm, 20);
--   new.date_plantation := new.date_semis + j_cellule;
--   new.date_recolte    := new.date_plantation + j_champ;
--   new.date_fin        := new.date_recolte + j_recolte;
--   plants := greatest(1, floor(new.surface_m2 * 10000 / (espacement * espacement)));
--   if plants > new.surface_m2 * 50 then plants := (new.surface_m2 * 25)::int; end if;
--   new.plants_count := plants;
--   new.tiges_estimees := round(plants * rend * 0.7, 0);
--   new.revenu_estime := round(new.tiges_estimees * prix, 2);
--   new.graines_necessaires := ceil(plants * 1.3 * coalesce(cat.graines_par_plant, 1));
--   return new;
-- end; $$;
--
-- -- duplicate_season_plan : rejouer sa définition de 006_ferme.sql (section F)
-- -- (le trigger et la vue ci-dessus ne dépendent plus de prochaine_date_jjmm)
--
-- -- Valeurs d'avant 013, relues dans la table de corrections (la plus
-- -- ancienne correction de chaque champ porte la valeur d'origine), après
-- -- avoir levé la règle des 365 j
-- alter table public.culture_catalog drop constraint culture_catalog_cycle_365_check;
-- with origine as (
--   select distinct on (culture_id, champ) culture_id, champ, avant
--     from public.culture_catalog_corrections_013 order by culture_id, champ, id)
-- update public.culture_catalog c set
--   jours_cellule = coalesce((select avant from origine o where o.culture_id = c.id and o.champ = 'jours_cellule'), c.jours_cellule),
--   jours_champ   = coalesce((select avant from origine o where o.culture_id = c.id and o.champ = 'jours_champ'), c.jours_champ),
--   jours_recolte = coalesce((select avant from origine o where o.culture_id = c.id and o.champ = 'jours_recolte'), c.jours_recolte)
--  where c.id in (select culture_id from origine);
-- drop table public.culture_catalog_corrections_013;
-- alter table public.culture_catalog
--   drop constraint culture_catalog_floraison_debut_check,
--   drop constraint culture_catalog_annees_avant_recolte_check,
--   drop constraint culture_catalog_premiere_implantation_check,
--   drop constraint culture_catalog_cycle_check,
--   drop column floraison_debut,
--   drop column annees_avant_recolte,
--   drop column premiere_implantation,
--   drop column cycle;
-- alter table public.plantings
--   drop constraint plantings_arrachee_le_check,
--   drop column arrachee_le,
--   drop column achat_plant;
-- update public.plantings set date_semis = date_semis;
-- drop function public.prochaine_date_jjmm(date, text);
-- commit;
