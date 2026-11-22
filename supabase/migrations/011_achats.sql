-- ============================================================
-- 011 : fournisseurs et bons de commande
-- ============================================================
-- Besoin : « bien gérer mes fournisseurs, et les bons de commande, par
-- exemple de mes graines ». Jusqu'ici, seed_orders (001) calculait le besoin
-- en graines par saison avec un fournisseur en texte libre : ni fichier
-- fournisseurs, ni bon numéroté, ni lien avec les dépenses (008).
--
-- Choix :
--  * suppliers est au niveau de la FERME (permanente) : un semencier sert
--    d'une année sur l'autre. Les conditions commerciales (minimum de
--    commande, franco de port, délai habituel) sont saisies par
--    l'utilisatrice, NULL tant qu'elles ne le sont pas, jamais en dur ;
--  * purchase_orders porte une SAISON D'IMPUTATION (season_id) : c'est elle
--    qui reçoit les dépenses. farm_id est recopié de la saison par trigger,
--    jamais fourni par le client (même principe que costs en 008) ;
--  * numéro de bon : continu par ferme et par année civile de l'envoi
--    (BC-2026-001, BC-2026-002…). Attribué par envoyer_bon(), jamais au
--    brouillon, depuis purchase_order_counters verrouillée par
--    SELECT … FOR UPDATE dans la transaction. Pas de sequence : elle n'est
--    pas transactionnelle et laisse des trous au rollback ;
--  * cycle : brouillon → envoye → confirme → recu_partiel → recu, ou annule.
--    Le statut, le numéro, les dates d'envoi et de réception et les
--    quantités reçues ne s'écrivent QUE par les fonctions (privilèges de
--    colonnes : authenticated n'a pas le droit d'UPDATE sur ces colonnes) ;
--  * un bon envoyé est figé : ses lignes (ajout, suppression, quantités,
--    prix), son fournisseur, sa saison et ses frais de port ne changent
--    plus (trigger). Restent possibles : la date de livraison prévue, les
--    notes, la confirmation, la réception et l'annulation. Un bon envoyé ne
--    se supprime pas ; seule la suppression en cascade d'une saison ou
--    d'une ferme entière l'emporte (pg_trigger_depth() > 1) ;
--  * receptionner_bon() reçoit les quantités reçues CUMULÉES par ligne
--    (« ce qui est arrivé en tout ») et crée les dépenses dans costs.
--    ANTI-DOUBLON : la dépense d'une ligne vaut
--        round(reçu_après × prix, 2) − round(reçu_avant × prix, 2)
--    calculée sous verrou FOR UPDATE du bon et de ses lignes. Rejouer la
--    même réception (double clic, renvoi après coupure réseau) donne un
--    écart nul : aucune dépense. Une quantité reçue ne peut pas diminuer.
--    Les dépenses successives d'une ligne totalisent exactement son
--    line_total une fois tout reçu. Les frais de port sont passés une
--    seule fois (catégorie transport), à la première réception, marqués
--    par shipping_expensed ;
--  * chaque dépense créée porte purchase_order_id et purchase_order_line_id
--    (colonnes ajoutées à costs, nullables) : l'écran d'achats retrouve
--    les dépenses d'un bon, l'écran de rentabilité les compte comme les
--    autres. Catégorie : semences pour sachet / graines / grammes,
--    plants_bulbes pour plants / bulbes / tubercules / godets ; pour
--    « unité », selon le type du fournisseur (emballage → emballage,
--    fournitures → materiel, semencier → semences, pépinière et bulbes →
--    plants_bulbes, autre → autre) ;
--  * un prix unitaire NULL veut dire « à saisir » : le brouillon s'enregistre,
--    mais envoyer_bon() refuse un bon dont une ligne n'a pas de prix ;
--  * RLS sur le modèle de 005 à 008 : membres de la ferme
--    (my_farm_ids(), my_season_ids()). Aucune policy ne relit une table
--    modifiée par la même instruction (lignes : farm_id recopié par trigger
--    et comparé directement) ;
--  * fonctions : enregistrer_bon() en SECURITY INVOKER (la RLS s'applique
--    comme à une requête directe) ; envoyer_bon(), confirmer_bon(),
--    receptionner_bon() et annuler_bon() en SECURITY DEFINER car elles
--    écrivent des colonnes interdites au client (statut, numéro, quantités
--    reçues, compteur). Elles vérifient elles-mêmes l'appartenance à la
--    ferme (_bon_verrouiller), avec search_path vide.
-- Retour arrière : voir le bloc commenté en fin de fichier.
-- ============================================================

-- ------------------------------------------------------------
-- A. Fournisseurs
-- ------------------------------------------------------------
create table public.suppliers (
  id                      uuid primary key default gen_random_uuid(),
  farm_id                 uuid not null references public.farms(id) on delete cascade,
  name                    text not null check (length(trim(name)) > 0),
  kind                    text not null default 'semencier'
                          check (kind in ('semencier','pepiniere','bulbes','fournitures','emballage','autre')),
  contact_name            text,
  email                   text,
  phone                   text,
  website                 text,
  address                 text,
  customer_number         text,
  min_order_amount        numeric(12,2) check (min_order_amount is null or min_order_amount > 0),
  free_shipping_threshold numeric(12,2) check (free_shipping_threshold is null or free_shipping_threshold > 0),
  lead_time_days          integer check (lead_time_days is null or lead_time_days between 0 and 365),
  organic_certified       boolean not null default false,
  notes                   text,
  archived_at             timestamptz,
  created_by              uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now()
);
comment on column public.suppliers.min_order_amount is 'Minimum de commande en euros (hors port), saisi par l''utilisatrice. NULL = non renseigné : aucune alerte.';
comment on column public.suppliers.free_shipping_threshold is 'Franco de port en euros (hors port), saisi par l''utilisatrice. NULL = non renseigné : aucune alerte.';
comment on column public.suppliers.lead_time_days is 'Délai habituel de livraison en jours, saisi par l''utilisatrice.';
-- Un nom par ferme (sert aussi à reconnaître le fournisseur texte de seed_orders)
create unique index suppliers_farm_name_uidx on public.suppliers(farm_id, lower(trim(name)));

-- ------------------------------------------------------------
-- B. Compteurs de numérotation (une ligne par ferme et par année)
-- ------------------------------------------------------------
create table public.purchase_order_counters (
  farm_id     uuid not null references public.farms(id) on delete cascade,
  year        integer not null check (year between 2000 and 2999),
  last_number integer not null default 0 check (last_number >= 0),
  primary key (farm_id, year)
);

-- ------------------------------------------------------------
-- C. Bons de commande
-- ------------------------------------------------------------
create table public.purchase_orders (
  id                uuid primary key default gen_random_uuid(),
  farm_id           uuid not null references public.farms(id) on delete cascade,
  season_id         uuid not null references public.seasons(id) on delete cascade,
  supplier_id       uuid not null references public.suppliers(id) on delete restrict,
  number_year       integer,
  number_seq        integer check (number_seq is null or number_seq > 0),
  number            text generated always as (
                      case when number_seq is null then null
                           else 'BC-' || number_year::text || '-' || lpad(number_seq::text, 3, '0') end
                    ) stored,
  status            text not null default 'brouillon'
                    check (status in ('brouillon','envoye','confirme','recu_partiel','recu','annule')),
  order_date        date,
  expected_date     date,
  received_date     date,
  shipping_amount   numeric(12,2) not null default 0 check (shipping_amount >= 0),
  shipping_expensed boolean not null default false,
  notes             text,
  sent_at           timestamptz,
  cancelled_at      timestamptz,
  created_by        uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (farm_id, number_year, number_seq),
  check ((number_seq is null) = (number_year is null)),
  check (status in ('brouillon','annule') or number_seq is not null),
  check (status = 'brouillon' or status = 'annule' or order_date is not null)
);
create index purchase_orders_farm_idx on public.purchase_orders(farm_id, status);
create index purchase_orders_season_idx on public.purchase_orders(season_id);
create index purchase_orders_supplier_idx on public.purchase_orders(supplier_id);

-- ------------------------------------------------------------
-- D. Lignes de bon
-- ------------------------------------------------------------
create table public.purchase_order_lines (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  farm_id           uuid not null references public.farms(id) on delete cascade,
  culture_id        uuid references public.culture_catalog(id) on delete set null,
  variety           text,
  label             text not null check (length(trim(label)) > 0),
  supplier_ref      text,
  unit              text not null default 'graines'
                    check (unit in ('sachet','graines','grammes','plants','bulbes','tubercules','godets','unite')),
  quantity          numeric(12,2) not null check (quantity > 0),
  quantity_received numeric(12,2) not null default 0 check (quantity_received >= 0 and quantity_received <= quantity),
  unit_price        numeric(12,2) check (unit_price is null or unit_price >= 0),
  line_total        numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  organic           boolean not null default false,
  seed_order_id     uuid references public.seed_orders(id) on delete set null,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);
comment on column public.purchase_order_lines.unit_price is 'Prix unitaire en euros. NULL = à saisir : le bon ne peut pas être envoyé.';
create index purchase_order_lines_po_idx on public.purchase_order_lines(purchase_order_id, sort_order);
create index purchase_order_lines_farm_idx on public.purchase_order_lines(farm_id);
create index purchase_order_lines_culture_idx on public.purchase_order_lines(culture_id) where culture_id is not null;
create index purchase_order_lines_seed_order_idx on public.purchase_order_lines(seed_order_id) where seed_order_id is not null;

-- ------------------------------------------------------------
-- E. Lien dépense → bon (costs, 008)
-- ------------------------------------------------------------
alter table public.costs
  add column purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  add column purchase_order_line_id uuid references public.purchase_order_lines(id) on delete set null;
create index costs_purchase_order_idx on public.costs(purchase_order_id) where purchase_order_id is not null;

-- ------------------------------------------------------------
-- F. Cohérence (triggers)
-- ------------------------------------------------------------
-- Fournisseur : il ne change pas de ferme.
create or replace function public.achats_fournisseur_avant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.farm_id is distinct from old.farm_id then
    raise exception 'Un fournisseur ne change pas de ferme';
  end if;
  return new;
end; $$;

create trigger trg_suppliers_avant before update on public.suppliers
  for each row execute function public.achats_fournisseur_avant();

-- Bon : farm_id recopié de la saison, fournisseur de la même ferme,
-- transitions de statut, bon figé après envoi.
create or replace function public.achats_bon_avant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_farm uuid;
begin
  select s.farm_id into v_farm from public.seasons s where s.id = new.season_id;
  if v_farm is null then raise exception 'Saison % introuvable', new.season_id; end if;

  if tg_op = 'INSERT' then
    new.farm_id := v_farm;
    if new.status <> 'brouillon' or new.number_seq is not null or new.shipping_expensed then
      raise exception 'Un bon de commande naît brouillon, sans numéro';
    end if;
  else
    if new.farm_id is distinct from old.farm_id or v_farm <> old.farm_id then
      raise exception 'Un bon de commande ne change pas de ferme';
    end if;
    if old.status <> 'brouillon' and (
         new.season_id is distinct from old.season_id
      or new.supplier_id is distinct from old.supplier_id
      or new.shipping_amount is distinct from old.shipping_amount
      or new.number_seq is distinct from old.number_seq
      or new.number_year is distinct from old.number_year
      or new.order_date is distinct from old.order_date
      or new.created_by is distinct from old.created_by) then
      raise exception 'Bon % déjà envoyé : seuls la date de livraison prévue, les notes, la réception et l''annulation restent possibles', old.number;
    end if;
    if new.status is distinct from old.status and not (
         (old.status = 'brouillon'    and new.status in ('envoye','annule'))
      or (old.status = 'envoye'       and new.status in ('confirme','recu_partiel','recu','annule'))
      or (old.status = 'confirme'     and new.status in ('recu_partiel','recu','annule'))
      or (old.status = 'recu_partiel' and new.status = 'recu')) then
      raise exception 'Passage de « % » à « % » impossible', old.status, new.status;
    end if;
    if old.status in ('recu','annule') and (new.expected_date is distinct from old.expected_date) then
      raise exception 'Bon clos : la date prévue ne change plus';
    end if;
  end if;

  if not exists (select 1 from public.suppliers f where f.id = new.supplier_id and f.farm_id = new.farm_id) then
    raise exception 'Fournisseur % hors de la ferme', new.supplier_id;
  end if;
  return new;
end; $$;

create trigger trg_purchase_orders_avant before insert or update on public.purchase_orders
  for each row execute function public.achats_bon_avant();

-- Pas de DELETE d'un bon envoyé. La cascade d'une saison ou d'une ferme
-- supprimée (déclenchée par un autre trigger, profondeur > 1) passe.
create or replace function public.achats_bon_suppression()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'brouillon' and pg_trigger_depth() = 1 then
    raise exception 'Bon % déjà envoyé : il ne se supprime pas, il s''annule', old.number;
  end if;
  return old;
end; $$;

create trigger trg_purchase_orders_suppression before delete on public.purchase_orders
  for each row execute function public.achats_bon_suppression();

-- Ligne : farm_id recopié du bon, culture et besoin de la ferme, lignes
-- figées dès l'envoi (seule la quantité reçue évolue, par receptionner_bon).
create or replace function public.achats_ligne_avant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text; v_farm uuid;
begin
  if tg_op = 'DELETE' then
    select po.status into v_status from public.purchase_orders po where po.id = old.purchase_order_id;
    if v_status is not null and v_status <> 'brouillon' and pg_trigger_depth() = 1 then
      raise exception 'Bon déjà envoyé : ses lignes ne se suppriment plus';
    end if;
    return old;
  end if;

  select po.status, po.farm_id into v_status, v_farm from public.purchase_orders po where po.id = new.purchase_order_id;
  -- Action de clé étrangère (seed_orders ou culture supprimés : « on delete
  -- set null ») ou cascade en cours : on la laisse passer telle quelle.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;
  if v_farm is null then raise exception 'Bon de commande % introuvable', new.purchase_order_id; end if;
  new.farm_id := v_farm;

  if tg_op = 'INSERT' then
    if v_status <> 'brouillon' then raise exception 'Bon déjà envoyé : on n''y ajoute plus de ligne'; end if;
    if new.quantity_received <> 0 then raise exception 'Une ligne naît sans quantité reçue'; end if;
  else
    if new.purchase_order_id is distinct from old.purchase_order_id then
      raise exception 'Une ligne ne change pas de bon';
    end if;
    if v_status <> 'brouillon' and (
         new.culture_id is distinct from old.culture_id
      or new.variety is distinct from old.variety
      or new.label is distinct from old.label
      or new.supplier_ref is distinct from old.supplier_ref
      or new.unit is distinct from old.unit
      or new.quantity is distinct from old.quantity
      or new.unit_price is distinct from old.unit_price
      or new.organic is distinct from old.organic
      or new.seed_order_id is distinct from old.seed_order_id
      or new.sort_order is distinct from old.sort_order) then
      raise exception 'Bon déjà envoyé : ses lignes et quantités commandées ne changent plus';
    end if;
    if v_status = 'brouillon' and new.quantity_received <> 0 then
      raise exception 'Un brouillon ne se réceptionne pas';
    end if;
  end if;

  if new.culture_id is not null and not exists (
    select 1 from public.culture_catalog c
    where c.id = new.culture_id
      and (c.user_id is null
           or c.user_id in (select fm.user_id from public.farm_members fm where fm.farm_id = v_farm))
  ) then
    raise exception 'Culture % hors du catalogue de la ferme', new.culture_id;
  end if;
  if new.seed_order_id is not null and not exists (
    select 1 from public.seed_orders so join public.seasons s on s.id = so.season_id
    where so.id = new.seed_order_id and s.farm_id = v_farm
  ) then
    raise exception 'Besoin en graines % hors de la ferme', new.seed_order_id;
  end if;
  return new;
end; $$;

create trigger trg_purchase_order_lines_avant before insert or update or delete on public.purchase_order_lines
  for each row execute function public.achats_ligne_avant();

-- ------------------------------------------------------------
-- G. Fonctions atomiques
-- ------------------------------------------------------------
-- Verrouille un bon et vérifie que l'appelant est membre de sa ferme.
-- Interne : appelée par les fonctions SECURITY DEFINER ci-dessous.
create or replace function public._bon_verrouiller(p_id uuid)
returns public.purchase_orders language plpgsql security definer set search_path = '' as $$
declare b public.purchase_orders;
begin
  select * into b from public.purchase_orders where id = p_id for update;
  if not found or auth.uid() is null or not exists (
    select 1 from public.farm_members fm where fm.farm_id = b.farm_id and fm.user_id = auth.uid()
  ) then
    raise exception 'Bon de commande introuvable ou inaccessible' using errcode = 'P0002';
  end if;
  return b;
end; $$;

-- Brouillon : création (p_id null) ou remplacement complet de l'en-tête et
-- des lignes. SECURITY INVOKER : la RLS s'applique.
-- p_bon : {season_id, supplier_id, expected_date, shipping_amount, notes}
-- p_lignes : [{culture_id, variety, label, supplier_ref, unit, quantity, unit_price, organic, seed_order_id}]
create or replace function public.enregistrer_bon(p_id uuid, p_bon jsonb, p_lignes jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid := p_id; n int;
begin
  if v_id is null then
    insert into public.purchase_orders (season_id, supplier_id, expected_date, shipping_amount, notes)
    values ((p_bon->>'season_id')::uuid, (p_bon->>'supplier_id')::uuid,
            nullif(p_bon->>'expected_date', '')::date,
            coalesce(nullif(p_bon->>'shipping_amount', '')::numeric, 0), nullif(p_bon->>'notes', ''))
    returning id into v_id;
  else
    update public.purchase_orders set
      season_id = coalesce(nullif(p_bon->>'season_id', '')::uuid, season_id),
      supplier_id = coalesce(nullif(p_bon->>'supplier_id', '')::uuid, supplier_id),
      expected_date = nullif(p_bon->>'expected_date', '')::date,
      shipping_amount = coalesce(nullif(p_bon->>'shipping_amount', '')::numeric, 0),
      notes = nullif(p_bon->>'notes', '')
    where id = v_id and status = 'brouillon';
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Brouillon introuvable, inaccessible ou déjà envoyé'; end if;
    delete from public.purchase_order_lines where purchase_order_id = v_id;
  end if;

  insert into public.purchase_order_lines
    (purchase_order_id, culture_id, variety, label, supplier_ref, unit, quantity, unit_price, organic, seed_order_id, sort_order)
  select v_id, l.culture_id, nullif(trim(l.variety), ''), l.label, nullif(trim(l.supplier_ref), ''),
         coalesce(l.unit, 'graines'), l.quantity, l.unit_price, coalesce(l.organic, false), l.seed_order_id,
         (e.ord - 1)::int
  from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) with ordinality as e(j, ord),
       jsonb_to_record(e.j)
    as l(culture_id uuid, variety text, label text, supplier_ref text, unit text, quantity numeric,
         unit_price numeric, organic boolean, seed_order_id uuid);
  return v_id;
end; $$;

-- Envoi : numéro continu par ferme et par année, date de commande = jour
-- de l'envoi à Paris.
create or replace function public.envoyer_bon(p_id uuid)
returns public.purchase_orders language plpgsql security definer set search_path = '' as $$
declare b public.purchase_orders; v_date date; v_annee int; v_num int;
begin
  b := public._bon_verrouiller(p_id);
  if b.status <> 'brouillon' then raise exception 'Bon % déjà envoyé', b.number; end if;
  if not exists (select 1 from public.purchase_order_lines where purchase_order_id = b.id) then
    raise exception 'Un bon de commande doit avoir au moins une ligne';
  end if;
  if exists (select 1 from public.purchase_order_lines where purchase_order_id = b.id and unit_price is null) then
    raise exception 'Prix unitaire à saisir sur au moins une ligne';
  end if;
  if exists (select 1 from public.suppliers where id = b.supplier_id and archived_at is not null) then
    raise exception 'Fournisseur archivé : désarchivez-le ou choisissez-en un autre';
  end if;

  v_date := (now() at time zone 'Europe/Paris')::date;
  v_annee := extract(year from v_date)::int;
  insert into public.purchase_order_counters (farm_id, year, last_number)
  values (b.farm_id, v_annee, 0) on conflict (farm_id, year) do nothing;
  select c.last_number + 1 into v_num from public.purchase_order_counters c
  where c.farm_id = b.farm_id and c.year = v_annee for update;
  update public.purchase_order_counters set last_number = v_num where farm_id = b.farm_id and year = v_annee;

  update public.purchase_orders
     set status = 'envoye', number_year = v_annee, number_seq = v_num, order_date = v_date, sent_at = now()
   where id = b.id returning * into b;
  return b;
end; $$;

-- Confirmation par le fournisseur, avec éventuellement sa date de livraison.
create or replace function public.confirmer_bon(p_id uuid, p_date_prevue date default null)
returns public.purchase_orders language plpgsql security definer set search_path = '' as $$
declare b public.purchase_orders;
begin
  b := public._bon_verrouiller(p_id);
  if b.status <> 'envoye' then raise exception 'Seul un bon envoyé se confirme (statut : %)', b.status; end if;
  update public.purchase_orders set status = 'confirme', expected_date = coalesce(p_date_prevue, expected_date)
   where id = b.id returning * into b;
  return b;
end; $$;

-- Réception. p_lignes : [{id, quantity_received}] en quantités CUMULÉES.
-- Une ligne absente garde sa quantité reçue. Crée les dépenses de l'écart.
create or replace function public.receptionner_bon(p_id uuid, p_lignes jsonb, p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.purchase_orders;
  f public.suppliers;
  r record;
  v_q numeric(12,2);
  v_montant numeric(12,2);
  v_cat text;
  v_nb int := 0;
  v_total numeric(12,2) := 0;
  v_recu bool;
  v_tout bool;
  v_bouge bool := false;
begin
  b := public._bon_verrouiller(p_id);
  if b.status not in ('envoye','confirme','recu_partiel') then
    raise exception 'Ce bon ne peut pas être réceptionné (statut : %)', b.status;
  end if;
  if p_date is null then raise exception 'Date de réception requise'; end if;
  if p_date < b.order_date then raise exception 'Réception (%) antérieure à la commande (%)', p_date, b.order_date; end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then raise exception 'Lignes de réception attendues en tableau'; end if;
  select * into f from public.suppliers where id = b.supplier_id;

  -- Lignes du bon verrouillées ; toute ligne inconnue ou étrangère au bon est refusée.
  perform 1 from public.purchase_order_lines where purchase_order_id = b.id for update;
  if exists (
    select 1 from jsonb_to_recordset(p_lignes) as x(id uuid, quantity_received numeric)
    where x.id is null or not exists (select 1 from public.purchase_order_lines l where l.id = x.id and l.purchase_order_id = b.id)
  ) then
    raise exception 'Ligne inconnue pour ce bon';
  end if;
  if (select count(*) from jsonb_to_recordset(p_lignes) as x(id uuid, quantity_received numeric))
     <> (select count(distinct x.id) from jsonb_to_recordset(p_lignes) as x(id uuid, quantity_received numeric)) then
    raise exception 'Ligne présente deux fois';
  end if;

  for r in
    select l.*, x.quantity_received as q_saisie
    from jsonb_to_recordset(p_lignes) as x(id uuid, quantity_received numeric)
    join public.purchase_order_lines l on l.id = x.id
    order by l.sort_order, l.id
  loop
    if r.q_saisie is null or r.q_saisie < 0 then raise exception 'Quantité reçue invalide (%)', r.label; end if;
    v_q := round(r.q_saisie, 2);
    if v_q < r.quantity_received then
      raise exception 'La quantité reçue ne peut pas diminuer (% : % → %)', r.label, r.quantity_received, v_q;
    end if;
    if v_q > r.quantity then
      raise exception 'Quantité reçue supérieure à la commandée (% : % > %)', r.label, v_q, r.quantity;
    end if;
    continue when v_q = r.quantity_received;
    v_bouge := true;
    update public.purchase_order_lines set quantity_received = v_q where id = r.id;

    v_montant := round(v_q * r.unit_price, 2) - round(r.quantity_received * r.unit_price, 2);
    if v_montant > 0 then
      v_cat := case
        when r.unit in ('sachet','graines','grammes') then 'semences'
        when r.unit in ('plants','bulbes','tubercules','godets') then 'plants_bulbes'
        else case f.kind when 'emballage' then 'emballage' when 'fournitures' then 'materiel'
                         when 'semencier' then 'semences' when 'pepiniere' then 'plants_bulbes'
                         when 'bulbes' then 'plants_bulbes' else 'autre' end
      end;
      insert into public.costs (season_id, date, category, amount, culture_id, supplier, notes, purchase_order_id, purchase_order_line_id)
      values (b.season_id, p_date, v_cat, v_montant, r.culture_id, f.name,
              b.number || ' · ' || r.label || coalesce(' « ' || r.variety || ' »', '') || ' · reçu '
                || trim(to_char(v_q - r.quantity_received, 'FM999999990.99')) || ' ' || r.unit,
              b.id, r.id);
      v_nb := v_nb + 1;
      v_total := v_total + v_montant;
    end if;
  end loop;

  if not v_bouge then
    -- Rien de nouveau : réception déjà enregistrée (double envoi) ou saisie vide.
    return jsonb_build_object('id', b.id, 'status', b.status, 'depenses_creees', 0, 'montant', 0);
  end if;

  if b.shipping_amount > 0 and not b.shipping_expensed then
    insert into public.costs (season_id, date, category, amount, supplier, notes, purchase_order_id)
    values (b.season_id, p_date, 'transport', b.shipping_amount, f.name, b.number || ' · frais de port', b.id);
    v_nb := v_nb + 1;
    v_total := v_total + b.shipping_amount;
  end if;

  select bool_and(quantity_received >= quantity), bool_or(quantity_received > 0) into v_tout, v_recu
  from public.purchase_order_lines where purchase_order_id = b.id;

  update public.purchase_orders
     set status = case when v_tout then 'recu' else 'recu_partiel' end,
         received_date = p_date,
         shipping_expensed = shipping_expensed or shipping_amount > 0
   where id = b.id returning * into b;

  return jsonb_build_object('id', b.id, 'status', b.status, 'depenses_creees', v_nb, 'montant', v_total);
end; $$;

-- Annulation : brouillon, envoyé ou confirmé, tant que rien n'est reçu.
create or replace function public.annuler_bon(p_id uuid)
returns public.purchase_orders language plpgsql security definer set search_path = '' as $$
declare b public.purchase_orders;
begin
  b := public._bon_verrouiller(p_id);
  if b.status not in ('brouillon','envoye','confirme') then
    raise exception 'Ce bon ne peut plus être annulé (statut : %)', b.status;
  end if;
  if exists (select 1 from public.purchase_order_lines where purchase_order_id = b.id and quantity_received > 0) then
    raise exception 'Une partie du bon est déjà reçue : il ne s''annule plus';
  end if;
  update public.purchase_orders set status = 'annule', cancelled_at = now() where id = b.id returning * into b;
  return b;
end; $$;

-- ------------------------------------------------------------
-- H. RLS
-- ------------------------------------------------------------
alter table public.suppliers               enable row level security;
alter table public.purchase_order_counters enable row level security;
alter table public.purchase_orders         enable row level security;
alter table public.purchase_order_lines    enable row level security;

create policy "fournisseurs : équipe de la ferme" on public.suppliers for all to authenticated
  using (farm_id in (select public.my_farm_ids()))
  with check (farm_id in (select public.my_farm_ids()));

create policy "compteurs de bons : lecture équipe" on public.purchase_order_counters for select to authenticated
  using (farm_id in (select public.my_farm_ids()));

-- farm_id est posé par le trigger avant la vérification de la policy.
create policy "bons de commande : équipe de la ferme" on public.purchase_orders for all to authenticated
  using (farm_id in (select public.my_farm_ids()))
  with check (farm_id in (select public.my_farm_ids()) and season_id in (select public.my_season_ids()));

create policy "lignes de bon : équipe de la ferme" on public.purchase_order_lines for all to authenticated
  using (farm_id in (select public.my_farm_ids()))
  with check (farm_id in (select public.my_farm_ids()));

-- ------------------------------------------------------------
-- I. Droits
-- ------------------------------------------------------------
revoke all on public.suppliers, public.purchase_order_counters, public.purchase_orders, public.purchase_order_lines from anon;

-- Compteur : lecture seule pour le client, écrit par envoyer_bon().
revoke insert, update, delete, truncate on public.purchase_order_counters from authenticated;

-- Bons : statut, numéro, dates d'envoi et de réception, port passé en
-- dépense ne s'écrivent que par les fonctions.
revoke insert, update, truncate on public.purchase_orders from authenticated;
grant insert (season_id, supplier_id, expected_date, shipping_amount, notes) on public.purchase_orders to authenticated;
grant update (season_id, supplier_id, expected_date, shipping_amount, notes) on public.purchase_orders to authenticated;

-- Lignes : la quantité reçue ne s'écrit que par receptionner_bon().
revoke insert, update, truncate on public.purchase_order_lines from authenticated;
grant insert (purchase_order_id, culture_id, variety, label, supplier_ref, unit, quantity, unit_price, organic, seed_order_id, sort_order)
  on public.purchase_order_lines to authenticated;
grant update (culture_id, variety, label, supplier_ref, unit, quantity, unit_price, organic, seed_order_id, sort_order)
  on public.purchase_order_lines to authenticated;

revoke execute on function
  public.achats_fournisseur_avant(), public.achats_bon_avant(), public.achats_bon_suppression(),
  public.achats_ligne_avant(), public._bon_verrouiller(uuid)
from public, anon, authenticated;
revoke execute on function
  public.enregistrer_bon(uuid, jsonb, jsonb), public.envoyer_bon(uuid), public.confirmer_bon(uuid, date),
  public.receptionner_bon(uuid, jsonb, date), public.annuler_bon(uuid)
from public, anon;
grant execute on function
  public.enregistrer_bon(uuid, jsonb, jsonb), public.envoyer_bon(uuid), public.confirmer_bon(uuid, date),
  public.receptionner_bon(uuid, jsonb, date), public.annuler_bon(uuid)
to authenticated;

-- ------------------------------------------------------------
-- Retour arrière (à exécuter à la main si besoin, dans une transaction) :
--   drop function public.annuler_bon(uuid);
--   drop function public.receptionner_bon(uuid, jsonb, date);
--   drop function public.confirmer_bon(uuid, date);
--   drop function public.envoyer_bon(uuid);
--   drop function public.enregistrer_bon(uuid, jsonb, jsonb);
--   drop function public._bon_verrouiller(uuid);
--   drop index public.costs_purchase_order_idx;
--   alter table public.costs drop column purchase_order_line_id, drop column purchase_order_id;
--   drop table public.purchase_order_lines;
--   drop table public.purchase_orders;
--   drop table public.purchase_order_counters;
--   drop table public.suppliers;
--   drop function public.achats_ligne_avant();
--   drop function public.achats_bon_suppression();
--   drop function public.achats_bon_avant();
--   drop function public.achats_fournisseur_avant();
-- Les dépenses créées par les réceptions restent dans costs (ce sont des
-- dépenses réelles) ; elles perdent seulement leur lien vers le bon.
-- ------------------------------------------------------------
