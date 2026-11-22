-- ============================================================
-- 015 : semis et production, d'après le tableur de Marine
-- (« Plan de culture année 2 », bloc « Gestion de la production et du
-- rendement ») et capacité de la pépinière.
-- ============================================================
-- ÉCRITE, NON APPLIQUÉE.
--
-- Fusion avec 013 (faite) : 013 passe AVANT 015 et réécrit aussi
-- calc_planting_dates. 015 réécrit TOUTE la fonction ; elle reprend donc
-- à l'identique le bloc « Dates » de 013 (vivaces et bisannuelles :
-- première récolte = premier début de floraison ≥ plantation + délai ;
-- plant acheté : plantation = date saisie ; floraison absente : dates de
-- récolte NULL) et ajoute le bloc « Estimations » de 015.
--
-- Correction d'un bug : depuis 001/002, plants = m² × 10 000 / espacement²
-- (grille carrée, rangs ignorés) : Ammi 5 m² (3 rangs, 30 cm) donnait 55
-- plants au lieu de 50, Ammi 20 m² 222 au lieu de 200, Achillée 10 m² 111
-- au lieu de 100. Tous les écrans lisent ces colonnes (Analytique,
-- Disponibilité, Réel, Calendrier…).
-- Le test src/lib/domain/production-sql.test.ts (BLEUENN_TEST_PG) vérifie
-- que ce trigger et src/lib/domain/production.ts donnent les mêmes chiffres.
--
-- 1. Réglages par ferme (farms) :
--    * taux_perte_semis / taux_perte_champ : pertes de levée (« plants +
--      30 % ») et au champ (« tiges − 30 % »), en %, 30 par défaut comme le
--      tableur, réglables ;
--    * pépinière : un format de table (largeur, longueur, nombre, débord
--      total admis ajouté à la largeur ET à la longueur, 0 par défaut) et un
--      format de plaque (largeur, longueur, trous). NULL tant que la ferme
--      ne les a pas saisis : l'écran dit « capacité non renseignée », aucune
--      valeur n'est supposée.
--
-- 2. calc_planting_dates : les estimations stockées (plants_count,
--    graines_necessaires, tiges_estimees, revenu_estime) suivent désormais
--    les formules du tableur, comme src/lib/domain/production.ts :
--      plants  J = rangs × m² / (espacement / 100)          arrondi à l'unité
--      graines L = J × (1 + pertes levée) × graines/motte   arrondi à l'unité
--                  (plant acheté : plants à acheter = J × (1 + pertes levée))
--      tiges   O = J × rendement × (1 − pertes champ)       arrondi à l'unité
--      revenu  R = O exact × prix/tige                       au centime
--    Une donnée manquante (espacement, rangs, rendement, prix, graines par
--    motte) donne NULL, plus jamais la valeur par défaut d'avant (20 cm,
--    1 tige, 0,50 €) ni la formule « surface / espacement² ».
--    Dates : celles de 013, inchangées.
--
-- 3. Un changement des taux d'une ferme recalcule ses plantations.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Réglages par ferme
-- ------------------------------------------------------------
alter table public.farms
  add column taux_perte_semis numeric(5,2) not null default 30
    check (taux_perte_semis >= 0 and taux_perte_semis < 100),
  add column taux_perte_champ numeric(5,2) not null default 30
    check (taux_perte_champ >= 0 and taux_perte_champ < 100),
  add column table_semis_largeur_cm  numeric(7,2) check (table_semis_largeur_cm > 0),
  add column table_semis_longueur_cm numeric(7,2) check (table_semis_longueur_cm > 0),
  add column table_semis_nombre      int          check (table_semis_nombre > 0),
  add column table_semis_debord_cm   numeric(6,2) not null default 0 check (table_semis_debord_cm >= 0),
  add column plaque_largeur_cm       numeric(6,2) check (plaque_largeur_cm > 0),
  add column plaque_longueur_cm      numeric(6,2) check (plaque_longueur_cm > 0),
  add column plaque_trous            int          check (plaque_trous > 0);

comment on column public.farms.taux_perte_semis is 'Pertes de levée en % (plants + x %), 30 par défaut comme le tableur.';
comment on column public.farms.taux_perte_champ is 'Pertes au champ en % (tiges − x %), 30 par défaut comme le tableur.';
comment on column public.farms.table_semis_debord_cm is 'Débord TOTAL admis des plaques, ajouté une fois à la largeur et une fois à la longueur de la table.';
comment on column public.farms.plaque_trous is 'Trous (mottes) par plaque de semis. NULL = non renseigné : capacité non calculable.';

-- RLS : farms a déjà ses policies (006) ; l'update reste réservé à l'owner.

-- ------------------------------------------------------------
-- 2. Estimations des plantations : formules du tableur
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
  t_semis numeric;
  t_champ numeric;
  surface numeric;
  rangs numeric;
  espacement numeric;
  graines_motte numeric;
  rend numeric;
  prix numeric;
  plants numeric;   -- J exact
  nettes numeric;   -- O exact
begin
  select * into cat from public.culture_catalog where id = new.culture_id;
  select f.taux_perte_semis, f.taux_perte_champ into t_semis, t_champ
    from public.planches pl
    join public.gardens g on g.id = pl.garden_id
    join public.farms f on f.id = g.farm_id
   where pl.id = new.planche_id;
  t_semis := coalesce(t_semis, 30);
  t_champ := coalesce(t_champ, 30);

  -- ===== Dates : bloc de 013, à l'identique =====
  -- Plant acheté : pas de cellule, la date saisie est la plantation
  j_cellule := case when new.achat_plant then 0
                    else coalesce(nullif(new.jours_cellule_override, 0), cat.jours_cellule, 0) end;
  j_champ   := coalesce(new.jours_champ_override, cat.jours_champ);
  j_recolte := coalesce(new.jours_recolte_override, cat.jours_recolte, 21);

  new.date_plantation := new.date_semis + j_cellule;
  if coalesce(cat.cycle, 'annuelle') = 'annuelle' then
    new.date_recolte := new.date_plantation + j_champ;
  else
    -- Vivace / bisannuelle : première floraison dans SA fenêtre annuelle ;
    -- sans début de floraison, pas de date de récolte (jamais devinée).
    new.date_recolte := public.prochaine_date_jjmm(
      new.date_plantation + coalesce(cat.delai_premiere_floraison_jours, 0), cat.debut_floraison);
  end if;
  new.date_fin := new.date_recolte + j_recolte;   -- null si pas de récolte connue

  -- ===== Estimations 015 : formules du tableur =====
  -- Données : 0 ou NULL = manquant
  surface       := nullif(new.surface_m2, 0);
  rangs         := nullif(cat.rangs_par_planche, 0);
  espacement    := nullif(cat.espacement_cm, 0);
  graines_motte := nullif(cat.graines_par_plant, 0);
  rend          := nullif(coalesce(new.rendement_override, cat.rendement_plant), 0);
  prix          := nullif(coalesce(new.prix_override, cat.prix_tige), 0);

  plants := rangs * surface / (espacement / 100.0);          -- NULL si une donnée manque
  nettes := plants * rend * (100 - t_champ) / 100.0;

  new.plants_count := round(plants);
  -- Plant acheté : plants à acheter (pertes de levée comprises), pas de graines
  new.graines_necessaires := case
    when new.achat_plant then round(plants * (100 + t_semis) / 100.0)
    else round(plants * (100 + t_semis) / 100.0 * graines_motte) end;
  new.tiges_estimees := round(nettes);
  new.revenu_estime  := round(nettes * prix, 2);
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. Taux d'une ferme modifiés : recalcul de ses plantations
-- ------------------------------------------------------------
create or replace function public.propagate_farm_taux()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.plantings p set date_semis = p.date_semis
    from public.planches pl join public.gardens g on g.id = pl.garden_id
   where pl.id = p.planche_id and g.farm_id = new.id;
  return new;
end; $$;

create trigger trg_propagate_farm_taux
  after update of taux_perte_semis, taux_perte_champ on public.farms
  for each row
  when (old.taux_perte_semis is distinct from new.taux_perte_semis
     or old.taux_perte_champ is distinct from new.taux_perte_champ)
  execute function public.propagate_farm_taux();

revoke execute on function public.propagate_farm_taux() from public, anon, authenticated;

-- Recalcul des plantations existantes avec les nouvelles formules
update public.plantings set date_semis = date_semis;

-- ------------------------------------------------------------
-- Retour arrière (à exécuter à la main si besoin, dans une transaction) :
--   drop trigger trg_propagate_farm_taux on public.farms;
--   drop function public.propagate_farm_taux();
--   -- recréer calc_planting_dates telle qu'en 013 (section C de 013_cultures_vivaces.sql), puis :
--   update public.plantings set date_semis = date_semis;
--   alter table public.farms
--     drop column taux_perte_semis, drop column taux_perte_champ,
--     drop column table_semis_largeur_cm, drop column table_semis_longueur_cm,
--     drop column table_semis_nombre, drop column table_semis_debord_cm,
--     drop column plaque_largeur_cm, drop column plaque_longueur_cm, drop column plaque_trous;
-- ------------------------------------------------------------
