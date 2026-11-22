-- ============================================================
-- 009 : journal de culture (notes datées, photos) et registre des
--       traitements phytosanitaires
-- ============================================================
-- But :
--  * un JOURNAL de notes datées, avec photos, rattachées à une planche,
--    une plantation ou une culture (observation, maladie, ravageur,
--    irrigation, fertilisation, météo, remarque de récolte, autre) ;
--  * un REGISTRE des traitements phytosanitaires, saisi par l'utilisatrice
--    (registre numérique obligatoire au 1er janvier 2027, arrêté du
--    24 décembre 2025). Aucune valeur réglementaire n'est en base : ni liste
--    de produits, ni dose maximale, ni délai avant récolte. Tout est saisi.
--
-- Choix :
--  * farm_id est OBLIGATOIRE et ne contredit jamais les références : le
--    trigger le recopie de la saison si elle est donnée, sinon de la planche,
--    de la plantation ou du jardin. Sans aucune référence (note « ferme
--    entière »), le farm_id fourni est gardé et la RLS vérifie qu'il est
--    bien une ferme de l'appelant ;
--  * season_id est facultatif (une note peut concerner la ferme hors
--    saison). Supprimer une saison ne supprime ni note ni traitement : la
--    ligne reste, sans saison (on delete set null) ;
--  * planche, plantation, culture et jardin sont facultatifs ; le trigger
--    vérifie qu'ils appartiennent à la ferme (même contrôle que
--    couts_set_farm en 008) et complète planche, jardin et culture depuis la
--    plantation quand ils manquent, pour que l'historique d'une planche
--    retrouve la note ;
--  * le REGISTRE garde un libellé figé de la culture, du lieu et de
--    l'opérateur (culture_libelle, lieu_libelle, operateur_nom), recopiés à
--    la saisie : une planche ou une culture supprimée plus tard ne rend pas
--    une ligne du registre illisible (les références passent à null) ;
--  * aucune purge : les sources divergent sur la durée de conservation
--    (3 ou 5 ans) ; la décision reste à l'utilisatrice ;
--  * photos : table journal_photos (une ligne par fichier) et bucket
--    Storage PRIVÉ `journal`, chemin `<farm_id>/<entry_id>/<fichier>`.
--    Lecture par URL signée uniquement. Le trigger vérifie que le chemin
--    commence par la ferme et la note de la ligne ;
--  * RLS : tout membre de la ferme lit et écrit (`my_farm_ids()`, qui lit
--    farm_members : aucune de ces tables n'est modifiée par les INSERT de
--    cette migration, donc pas de piège INSERT … RETURNING) ;
--  * les policies Storage comparent le premier dossier du chemin en TEXTE
--    aux fermes de l'appelant : un nom d'objet qui ne serait pas un uuid
--    ferait échouer un cast `::uuid` pour TOUTE lecture du bucket ; la
--    comparaison texte le refuse simplement.
-- Retour arrière : voir le bloc commenté en fin de fichier.
-- ============================================================

-- ------------------------------------------------------------
-- A. Journal de culture
-- ------------------------------------------------------------
create table public.journal_entries (
  id           uuid primary key default gen_random_uuid(),
  farm_id      uuid not null references public.farms(id) on delete cascade,
  season_id    uuid references public.seasons(id) on delete set null,
  date         date not null,
  kind         text not null default 'observation'
               check (kind in ('observation','maladie','ravageur','irrigation','fertilisation','meteo','recolte','autre')),
  body         text check (body is null or length(body) <= 4000),
  planche_id   uuid references public.planches(id) on delete set null,
  planting_id  uuid references public.plantings(id) on delete set null,
  culture_id   uuid references public.culture_catalog(id) on delete set null,
  created_by   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);
create index journal_entries_farm_date_idx on public.journal_entries(farm_id, date desc);
create index journal_entries_season_idx   on public.journal_entries(season_id) where season_id is not null;
create index journal_entries_planche_idx  on public.journal_entries(planche_id) where planche_id is not null;
create index journal_entries_planting_idx on public.journal_entries(planting_id) where planting_id is not null;
create index journal_entries_culture_idx  on public.journal_entries(culture_id) where culture_id is not null;

create table public.journal_photos (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.journal_entries(id) on delete cascade,
  farm_id     uuid not null references public.farms(id) on delete cascade,
  path        text not null unique,
  width       integer check (width is null or width > 0),
  height      integer check (height is null or height > 0),
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index journal_photos_entry_idx on public.journal_photos(entry_id);
create index journal_photos_farm_idx  on public.journal_photos(farm_id);

-- ------------------------------------------------------------
-- B. Registre des traitements phytosanitaires
-- ------------------------------------------------------------
create table public.treatments (
  id                     uuid primary key default gen_random_uuid(),
  farm_id                uuid not null references public.farms(id) on delete cascade,
  season_id              uuid references public.seasons(id) on delete set null,
  date                   date not null,
  -- Produit
  produit                text not null check (length(btrim(produit)) > 0),
  produit_type           text not null
                         check (produit_type in ('fongicide','insecticide','herbicide','acaricide','biocontrole','autre')),
  amm                    text check (amm is null or length(btrim(amm)) > 0),
  -- Dose et quantité (valeurs saisies ; aucune dose maximale en base)
  dose                   numeric(14,4) not null check (dose > 0),
  dose_unite             text not null
                         check (dose_unite in ('g/ha','kg/ha','mL/ha','L/ha','g/hL','kg/hL','mL/hL','L/hL')),
  quantite_totale        numeric(14,4) not null check (quantite_totale > 0),
  quantite_unite         text not null check (quantite_unite in ('g','kg','mL','L')),
  surface_m2             numeric(12,2) not null check (surface_m2 > 0),
  -- Culture et cible
  culture_id             uuid references public.culture_catalog(id) on delete set null,
  culture_libelle        text not null,
  cible                  text not null check (length(btrim(cible)) > 0),
  cible_type             text not null default 'autre'
                         check (cible_type in ('maladie','ravageur','adventice','autre')),
  -- Localisation
  lieu_type              text not null check (lieu_type in ('planche','jardin','serre','tunnel','autre')),
  garden_id              uuid references public.gardens(id) on delete set null,
  planche_id             uuid references public.planches(id) on delete set null,
  planting_id            uuid references public.plantings(id) on delete set null,
  lieu_libelle           text not null,
  ilot_pac               text,
  -- Récolte (délai saisi par l'utilisatrice, d'après l'étiquette du produit)
  date_recolte_suivante  date,
  delai_avant_recolte_j  integer check (delai_avant_recolte_j is null or delai_avant_recolte_j >= 0),
  -- Opérateur et conditions
  operateur_id           uuid references public.profiles(id) on delete set null,
  operateur_nom          text not null,
  vent                   text,
  temperature_c          numeric(4,1) check (temperature_c is null or temperature_c between -40 and 60),
  notes                  text,
  created_by             uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz
);
create index treatments_farm_date_idx on public.treatments(farm_id, date);
create index treatments_planche_idx   on public.treatments(planche_id) where planche_id is not null;
create index treatments_garden_idx    on public.treatments(garden_id) where garden_id is not null;
create index treatments_culture_idx   on public.treatments(culture_id) where culture_id is not null;
create index treatments_season_idx    on public.treatments(season_id) where season_id is not null;

-- ------------------------------------------------------------
-- C. Cohérence : farm_id déduit des références, références de la ferme
-- ------------------------------------------------------------
-- Contrôle commun : chaque référence fournie appartient à la ferme.
create or replace function public.journal_verifier_refs(
  p_farm uuid, p_planche uuid, p_planting uuid, p_culture uuid, p_garden uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_planche is not null and not exists (
    select 1 from public.planches pl join public.gardens g on g.id = pl.garden_id
    where pl.id = p_planche and g.farm_id = p_farm
  ) then
    raise exception 'Planche % hors de la ferme', p_planche;
  end if;

  if p_garden is not null and not exists (
    select 1 from public.gardens g where g.id = p_garden and g.farm_id = p_farm
  ) then
    raise exception 'Jardin % hors de la ferme', p_garden;
  end if;

  if p_planting is not null and not exists (
    select 1 from public.plantings p join public.seasons s on s.id = p.season_id
    where p.id = p_planting and s.farm_id = p_farm
  ) then
    raise exception 'Plantation % hors de la ferme', p_planting;
  end if;

  if p_culture is not null and not exists (
    select 1 from public.culture_catalog c
    where c.id = p_culture
      and (c.user_id is null
           or c.user_id in (select fm.user_id from public.farm_members fm where fm.farm_id = p_farm))
  ) then
    raise exception 'Culture % hors du catalogue de la ferme', p_culture;
  end if;
end; $$;

-- Ferme déduite de la première référence présente : saison, planche,
-- plantation, jardin. Null si aucune.
create or replace function public.journal_ferme_de(
  p_season uuid, p_planche uuid, p_planting uuid, p_garden uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.farm_id from public.seasons s where s.id = p_season),
    (select g.farm_id from public.planches pl join public.gardens g on g.id = pl.garden_id where pl.id = p_planche),
    (select s.farm_id from public.plantings p join public.seasons s on s.id = p.season_id where p.id = p_planting),
    (select g.farm_id from public.gardens g where g.id = p_garden)
  );
$$;

create or replace function public.journal_entries_set_farm()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_pl uuid; v_cu uuid;
begin
  if new.season_id is not null and not exists (select 1 from public.seasons where id = new.season_id) then
    raise exception 'Saison % introuvable', new.season_id;
  end if;

  -- Plantation : complète planche et culture quand elles manquent
  -- (seulement à la saisie ou quand la plantation change : une remise à null
  -- par cascade, planche ou plantation supprimée, ne doit rien recompléter)
  if new.planting_id is not null and (tg_op = 'INSERT' or new.planting_id is distinct from old.planting_id) then
    select p.planche_id, p.culture_id into v_pl, v_cu from public.plantings p where p.id = new.planting_id;
    if found then
      new.planche_id := coalesce(new.planche_id, v_pl);
      new.culture_id := coalesce(new.culture_id, v_cu);
    end if;
  end if;
  if new.planting_id is not null
     and (tg_op = 'INSERT' or new.planting_id is distinct from old.planting_id
          or new.planche_id is distinct from old.planche_id or new.culture_id is distinct from old.culture_id)
     and exists (select 1 from public.plantings p where p.id = new.planting_id
                 and (p.planche_id <> new.planche_id or p.culture_id <> new.culture_id)) then
    raise exception 'La plantation % ne correspond pas à la planche ou à la culture indiquée', new.planting_id;
  end if;

  v_farm := public.journal_ferme_de(new.season_id, new.planche_id, new.planting_id, null);
  if v_farm is not null then
    new.farm_id := v_farm;
  end if;
  if new.farm_id is null then
    raise exception 'Ferme introuvable : indiquez une saison, une planche ou la ferme';
  end if;

  -- Seules les références saisies ou modifiées sont contrôlées : une ligne
  -- remise à jour par une cascade ne doit pas échouer sur une plantation
  -- en cours de suppression.
  perform public.journal_verifier_refs(new.farm_id,
    case when tg_op = 'INSERT' or new.farm_id is distinct from old.farm_id or new.planche_id is distinct from old.planche_id then new.planche_id end,
    case when tg_op = 'INSERT' or new.farm_id is distinct from old.farm_id or new.planting_id is distinct from old.planting_id then new.planting_id end,
    case when tg_op = 'INSERT' or new.farm_id is distinct from old.farm_id or new.culture_id is distinct from old.culture_id then new.culture_id end,
    null);

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end; $$;

create trigger trg_journal_entries_set_farm before insert or update on public.journal_entries
  for each row execute function public.journal_entries_set_farm();

create or replace function public.journal_photos_set_farm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select e.farm_id into new.farm_id from public.journal_entries e where e.id = new.entry_id;
  if new.farm_id is null then
    raise exception 'Note % introuvable', new.entry_id;
  end if;
  -- Chemin : <farm_id>/<entry_id>/<fichier>, sans remontée de dossier
  if new.path not like new.farm_id::text || '/' || new.entry_id::text || '/%'
     or new.path like '%..%' or new.path like '%//%'
     or new.path = new.farm_id::text || '/' || new.entry_id::text || '/' then
    raise exception 'Chemin de photo invalide : %', new.path;
  end if;
  return new;
end; $$;

create trigger trg_journal_photos_set_farm before insert or update on public.journal_photos
  for each row execute function public.journal_photos_set_farm();

create or replace function public.treatments_set_farm()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_pl uuid; v_cu uuid;
begin
  if new.season_id is not null and not exists (select 1 from public.seasons where id = new.season_id) then
    raise exception 'Saison % introuvable', new.season_id;
  end if;

  -- Plantation : complète planche et culture ; planche : complète le jardin
  -- (seulement à la saisie ou quand la plantation change : une remise à null
  -- par cascade, planche ou plantation supprimée, ne doit rien recompléter)
  if new.planting_id is not null and (tg_op = 'INSERT' or new.planting_id is distinct from old.planting_id) then
    select p.planche_id, p.culture_id into v_pl, v_cu from public.plantings p where p.id = new.planting_id;
    if found then
      new.planche_id := coalesce(new.planche_id, v_pl);
      new.culture_id := coalesce(new.culture_id, v_cu);
    end if;
  end if;
  if new.planting_id is not null
     and (tg_op = 'INSERT' or new.planting_id is distinct from old.planting_id
          or new.planche_id is distinct from old.planche_id or new.culture_id is distinct from old.culture_id)
     and exists (select 1 from public.plantings p where p.id = new.planting_id
                 and (p.planche_id <> new.planche_id or p.culture_id <> new.culture_id)) then
    raise exception 'La plantation % ne correspond pas à la planche ou à la culture indiquée', new.planting_id;
  end if;
  if new.planche_id is not null then
    if new.garden_id is not null and not exists (
      select 1 from public.planches pl where pl.id = new.planche_id and pl.garden_id = new.garden_id) then
      raise exception 'La planche % n''est pas dans le jardin %', new.planche_id, new.garden_id;
    end if;
    select pl.garden_id into new.garden_id from public.planches pl where pl.id = new.planche_id;
  end if;

  v_farm := public.journal_ferme_de(new.season_id, new.planche_id, new.planting_id, new.garden_id);
  if v_farm is not null then
    new.farm_id := v_farm;
  end if;
  if new.farm_id is null then
    raise exception 'Ferme introuvable : indiquez une saison, un lieu ou la ferme';
  end if;

  perform public.journal_verifier_refs(new.farm_id,
    case when tg_op = 'INSERT' or new.farm_id is distinct from old.farm_id or new.planche_id is distinct from old.planche_id then new.planche_id end,
    case when tg_op = 'INSERT' or new.farm_id is distinct from old.farm_id or new.planting_id is distinct from old.planting_id then new.planting_id end,
    case when tg_op = 'INSERT' or new.farm_id is distinct from old.farm_id or new.culture_id is distinct from old.culture_id then new.culture_id end,
    case when tg_op = 'INSERT' or new.farm_id is distinct from old.farm_id or new.garden_id is distinct from old.garden_id then new.garden_id end);

  -- Libellés figés : recopiés à la saisie, ou quand la référence change
  -- sans que le libellé ait été modifié dans la même instruction.
  if new.culture_id is not null
     and (nullif(btrim(new.culture_libelle), '') is null
          or (tg_op = 'UPDATE' and new.culture_id is distinct from old.culture_id
              and new.culture_libelle is not distinct from old.culture_libelle)) then
    select c.name into new.culture_libelle from public.culture_catalog c where c.id = new.culture_id;
  end if;
  if nullif(btrim(new.culture_libelle), '') is null then
    raise exception 'Culture traitée requise';
  end if;

  -- Une référence remise à null (planche ou jardin supprimés) garde le libellé.
  if new.garden_id is not null
     and (nullif(btrim(new.lieu_libelle), '') is null
          or (tg_op = 'UPDATE'
              and ((new.planche_id is not null and new.planche_id is distinct from old.planche_id)
                   or (new.planche_id is null and new.garden_id is distinct from old.garden_id))
              and new.lieu_libelle is not distinct from old.lieu_libelle)) then
    select case when pl.id is not null then g.name || ' · ' || pl.name else g.name end
      into new.lieu_libelle
    from public.gardens g left join public.planches pl on pl.id = new.planche_id
    where g.id = new.garden_id;
  end if;
  if nullif(btrim(new.lieu_libelle), '') is null then
    raise exception 'Localisation requise';
  end if;
  if new.lieu_type = 'planche' and tg_op = 'INSERT' and new.planche_id is null then
    raise exception 'Choisissez la planche traitée';
  end if;
  if new.lieu_type = 'jardin' and tg_op = 'INSERT' and new.garden_id is null then
    raise exception 'Choisissez le jardin traité';
  end if;

  -- Opérateur : membre de la ferme quand c'est un compte (à la saisie ou
  -- quand il change ; quelqu'un qui a quitté l'équipe garde ses lignes)
  if new.operateur_id is not null
     and (tg_op = 'INSERT' or new.operateur_id is distinct from old.operateur_id or new.farm_id is distinct from old.farm_id) then
    if not exists (select 1 from public.farm_members fm
                   where fm.farm_id = new.farm_id and fm.user_id = new.operateur_id) then
      raise exception 'L''opérateur % n''est pas membre de la ferme', new.operateur_id;
    end if;
    if nullif(btrim(new.operateur_nom), '') is null then
      select coalesce(nullif(btrim(p.owner_name), ''), p.email) into new.operateur_nom
      from public.profiles p where p.id = new.operateur_id;
    end if;
  end if;
  if nullif(btrim(new.operateur_nom), '') is null then
    raise exception 'Opérateur requis';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end; $$;

create trigger trg_treatments_set_farm before insert or update on public.treatments
  for each row execute function public.treatments_set_farm();

-- ------------------------------------------------------------
-- D. RLS
-- ------------------------------------------------------------
alter table public.journal_entries enable row level security;
alter table public.journal_photos  enable row level security;
alter table public.treatments      enable row level security;

create policy "journal : équipe de la ferme" on public.journal_entries for all to authenticated
  using (farm_id in (select public.my_farm_ids()))
  with check (farm_id in (select public.my_farm_ids()));
create policy "photos du journal : équipe de la ferme" on public.journal_photos for all to authenticated
  using (farm_id in (select public.my_farm_ids()))
  with check (farm_id in (select public.my_farm_ids()));
create policy "traitements : équipe de la ferme" on public.treatments for all to authenticated
  using (farm_id in (select public.my_farm_ids()))
  with check (farm_id in (select public.my_farm_ids()));

-- ------------------------------------------------------------
-- E. Storage : bucket privé `journal`
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal', 'journal', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "journal : lecture des photos de ma ferme" on storage.objects for select to authenticated
  using (bucket_id = 'journal'
         and (storage.foldername(name))[1] in (select f::text from public.my_farm_ids() f));
create policy "journal : ajout de photos dans ma ferme" on storage.objects for insert to authenticated
  with check (bucket_id = 'journal'
              and (storage.foldername(name))[1] in (select f::text from public.my_farm_ids() f)
              and array_length(storage.foldername(name), 1) = 2);
create policy "journal : suppression des photos de ma ferme" on storage.objects for delete to authenticated
  using (bucket_id = 'journal'
         and (storage.foldername(name))[1] in (select f::text from public.my_farm_ids() f));

-- ------------------------------------------------------------
-- F. Droits
-- ------------------------------------------------------------
revoke all on public.journal_entries, public.journal_photos, public.treatments from anon;
revoke execute on function
  public.journal_verifier_refs(uuid, uuid, uuid, uuid, uuid),
  public.journal_ferme_de(uuid, uuid, uuid, uuid),
  public.journal_entries_set_farm(),
  public.journal_photos_set_farm(),
  public.treatments_set_farm()
from public, anon, authenticated;

-- ------------------------------------------------------------
-- Retour arrière (à exécuter à la main si besoin) :
--   Les fichiers du bucket se suppriment par l'API Storage (ou le tableau
--   de bord), pas en SQL : vider le bucket `journal` d'abord.
--   drop policy "journal : lecture des photos de ma ferme" on storage.objects;
--   drop policy "journal : ajout de photos dans ma ferme" on storage.objects;
--   drop policy "journal : suppression des photos de ma ferme" on storage.objects;
--   delete from storage.buckets where id = 'journal';   -- refusé si le bucket n'est pas vide
--   drop table public.journal_photos;
--   drop table public.journal_entries;
--   drop table public.treatments;
--   drop function public.journal_entries_set_farm();
--   drop function public.journal_photos_set_farm();
--   drop function public.treatments_set_farm();
--   drop function public.journal_ferme_de(uuid, uuid, uuid, uuid);
--   drop function public.journal_verifier_refs(uuid, uuid, uuid, uuid, uuid);
-- ------------------------------------------------------------
