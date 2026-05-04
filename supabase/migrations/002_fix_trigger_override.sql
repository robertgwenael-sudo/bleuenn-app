-- ============================================================
-- MIGRATION 002 : Dates dynamiques — catalogue + date_semis
-- Les dates se recalculent quand on change :
--   1. La date de semis d'une plantation
--   2. Un paramètre du catalogue (J.cellule, J.champ, etc.)
-- ============================================================

-- 1. Supprimer les triggers existants
DROP TRIGGER IF EXISTS trg_calc_planting ON public.plantings;
DROP TRIGGER IF EXISTS trg_propagate_catalog ON public.culture_catalog;

-- 2. Convertir date_plantation de GENERATED en colonne normale
ALTER TABLE public.plantings DROP COLUMN IF EXISTS date_plantation;
ALTER TABLE public.plantings ADD COLUMN date_plantation date;

-- 3. Remettre à zéro les overrides figés par l'ancien trigger
UPDATE public.plantings SET jours_cellule_override = 0;

-- ============================================================
-- TRIGGER A : Calcul des dates et estimations sur plantings
-- ============================================================
CREATE OR REPLACE FUNCTION calc_planting_dates()
RETURNS trigger AS $$
DECLARE
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
BEGIN
  SELECT * INTO cat FROM public.culture_catalog WHERE id = new.culture_id;
  SELECT * INTO pl FROM public.planches WHERE id = new.planche_id;

  -- Résoudre : override utilisateur (si != 0) sinon catalogue
  j_cellule := coalesce(nullif(new.jours_cellule_override, 0), cat.jours_cellule, 0);
  j_champ   := coalesce(new.jours_champ_override, cat.jours_champ);
  j_recolte := coalesce(new.jours_recolte_override, cat.jours_recolte, 21);
  rend      := coalesce(new.rendement_override, cat.rendement_plant, 1);
  prix      := coalesce(new.prix_override, cat.prix_tige, 0.50);
  surface   := new.surface_m2;
  espacement := coalesce(cat.espacement_cm, 20);

  -- Dates dynamiques
  new.date_plantation := new.date_semis + j_cellule;
  new.date_recolte    := new.date_plantation + j_champ;
  new.date_fin        := new.date_recolte + j_recolte;

  -- Estimations
  plants := greatest(1, floor(surface * 10000 / (espacement * espacement)));
  IF plants > surface * 50 THEN plants := (surface * 25)::int; END IF;

  new.plants_count       := plants;
  new.tiges_estimees     := round(plants * rend * 0.7, 0);
  new.revenu_estime      := round(new.tiges_estimees * prix, 2);
  new.graines_necessaires := ceil(plants * 1.3 * coalesce(cat.graines_par_plant, 1));

  RETURN new;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_planting
  BEFORE INSERT OR UPDATE ON public.plantings
  FOR EACH ROW EXECUTE FUNCTION calc_planting_dates();

-- ============================================================
-- TRIGGER B : Quand le catalogue change → recalculer toutes
-- les plantations qui utilisent cette culture
-- ============================================================
CREATE OR REPLACE FUNCTION propagate_catalog_changes()
RETURNS trigger AS $$
BEGIN
  -- Toucher date_semis déclenche trg_calc_planting → recalcul complet
  UPDATE public.plantings
     SET date_semis = date_semis
   WHERE culture_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_propagate_catalog
  AFTER UPDATE ON public.culture_catalog
  FOR EACH ROW EXECUTE FUNCTION propagate_catalog_changes();

-- ============================================================
-- Recalculer toutes les plantations existantes
-- ============================================================
UPDATE public.plantings SET date_semis = date_semis;

-- ============================================================
-- Vue avec dates calculées dynamiquement depuis le catalogue
-- (double sécurité : même si les colonnes stockées sont en retard,
--  la vue montre toujours les bonnes dates)
-- ============================================================
DROP VIEW IF EXISTS public.plantings_full;

CREATE OR REPLACE VIEW public.plantings_full AS
SELECT
  p.id,
  p.planche_id,
  p.culture_id,
  p.season_id,
  p.surface_m2,
  p.date_semis,
  -- Dates calculées dynamiquement depuis le catalogue
  (p.date_semis + coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0))
    AS date_plantation,
  (p.date_semis + coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0)
                + coalesce(p.jours_champ_override, c.jours_champ))
    AS date_recolte,
  (p.date_semis + coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0)
                + coalesce(p.jours_champ_override, c.jours_champ)
                + coalesce(p.jours_recolte_override, c.jours_recolte, 21))
    AS date_fin,
  p.plants_count,
  p.tiges_estimees,
  p.revenu_estime,
  p.graines_necessaires,
  p.jours_cellule_override,
  p.jours_champ_override,
  p.jours_recolte_override,
  p.rendement_override,
  p.prix_override,
  p.surface_m2 AS planting_m2,
  p.notes AS planting_notes,
  c.name AS culture_name,
  c.type AS culture_type,
  coalesce(nullif(p.jours_cellule_override, 0), c.jours_cellule, 0) AS jours_cellule,
  coalesce(p.jours_champ_override, c.jours_champ) AS jours_champ,
  coalesce(p.jours_recolte_override, c.jours_recolte, 21) AS jours_recolte,
  coalesce(p.rendement_override, c.rendement_plant) AS rendement,
  coalesce(p.prix_override, c.prix_tige) AS prix_tige,
  c.temp_germination,
  c.pincer,
  c.filet,
  c.couvre_sol,
  c.semis_direct,
  c.espacement_cm,
  c.rangs_par_planche,
  c.graines_par_plant,
  pl.name AS planche_name,
  pl.surface_m2 AS planche_m2,
  g.name AS garden_name,
  g.id AS garden_id,
  g.surface_m2 AS garden_m2,
  s.user_id
FROM public.plantings p
JOIN public.culture_catalog c ON c.id = p.culture_id
JOIN public.planches pl ON pl.id = p.planche_id
JOIN public.gardens g ON g.id = pl.garden_id
JOIN public.seasons s ON s.id = p.season_id;
