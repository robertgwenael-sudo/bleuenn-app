-- ============================================================
-- 014 : TVA ventilée par taux, lien commande → facture
-- ============================================================
-- ÉCRITE, NON APPLIQUÉE. À rejouer d'abord dans une transaction de test
-- (owner, membre, compte étranger, anonyme) terminée par un rollback.
--
-- Contexte : l'agricultrice applique la TVA. Règle vérifiée (BOFIP
-- BOI-TVA-LIQ-30-10-35, art. 278 bis du CGI) : taux réduit pour les fleurs
-- coupées fraîches ou séchées non transformées (« fleur non travaillée »),
-- taux normal pour les compositions florales (bouquets composés, décoration
-- de mariage, couronnes : « fleur travaillée »), ventilation ligne par ligne.
--
-- Choix :
--  * farm_vat_rates : les taux sont une DONNÉE DE PARAMÉTRAGE par ferme,
--    jamais une constante du code. Un taux est un entier en points de base
--    (1000 = 10 %, 550 = 5,5 %) : pas de flottant. Chaque ferme existante, et
--    chaque ferme créée ensuite, reçoit deux lignes pré-remplies (10 % et 20 %
--    à ce jour), modifiables dans les réglages de facturation. Une catégorie
--    (non_travaillee, travaillee, autre) sert au choix par défaut d'une ligne ;
--    un seul taux actif par catégorie principale. Pas de suppression : on
--    désactive (les lignes passées gardent leur taux recopié) ;
--  * farm_billing.assujettie_tva (défaut faux = comportement 010 inchangé :
--    un seul « Total » et la mention d'absence de TVA). Vrai : la mention
--    n'est plus exigée ni imprimée, le numéro de TVA intracommunautaire de la
--    ferme l'est (farm_billing.numero_tva) ;
--  * PRIX SAISIS HORS TAXE PARTOUT (sale_lines, order_lines, invoice_lines) :
--    la facture doit porter le prix unitaire HT et, par taux, le total HT et
--    la TVA (art. 242 nonies A, annexe II du CGI). Une saisie TTC ne retombe
--    pas toujours sur un prix HT au centime, la facture ne serait plus
--    exacte ligne à ligne. L'appli affiche donc le TTC en direct à côté du HT
--    (vente directe aux particuliers) mais enregistre le HT. sales.total reste
--    la somme HT des lignes (chiffre d'affaires) ;
--  * sale_lines / order_lines : vat_rate_id (catégorie choisie) et
--    taux_tva_pb recopié par trigger depuis farm_vat_rates à l'enregistrement
--    de la ligne (jamais fourni par l'appli). Un taux modifié ensuite ne
--    change pas une vente passée ;
--  * ARRONDIS : TVA calculée par taux sur le TOTAL HT de ce taux :
--      montant HT ligne = round(quantité × prix HT, 2) (colonne générée) ;
--      base HT du taux  = somme des montants HT des lignes à ce taux ;
--      TVA du taux      = round(base HT × taux / 10000, 2), moitié loin de zéro ;
--      total TVA = somme des TVA par taux ; total = total HT + total TVA.
--    Même calcul dans src/lib/domain/tva.ts ;
--  * invoices : assujettie_tva, total_ht, total_tva et ventilation_tva
--    (jsonb [{taux_pb, libelle, base_ht, tva, ttc}]) FIGÉS à l'émission ;
--    `total` reste le montant dû (TTC si assujettie), si bien que paiements,
--    statut et gestion ne changent pas. invoice_lines : vat_rate_id,
--    taux_tva_pb et libelle_tva figés. Un avoir reprend tout en négatif ;
--  * lignes de vente sans catégorie (ventes antérieures à 014, vente sans
--    lignes) : emettre_facture les refuse pour une ferme assujettie, sauf si
--    l'appelant choisit explicitement la catégorie à leur appliquer
--    (p_options.vat_rate_id). On ne devine pas ;
--  * bons de commande : orders.numero (« BC2026-0007 »), attribué par trigger
--    depuis order_counters (par ferme et par année, verrouillé). La facture
--    fige la liste des bons d'origine de ses ventes (invoices.commandes) et
--    les imprime en référence ;
--  * livrer_commande : sans p_lines, recopie elle-même les lignes de la
--    commande (aucune ressaisie). livrer_et_facturer : livraison ET facture
--    dans une seule transaction ;
--  * 0 facture en production : les colonnes ajoutées à invoices sont
--    complétées pour d'éventuelles lignes de test (total_ht = total), triggers
--    d'immuabilité suspendus le temps de cette reprise seulement.
-- RLS : farm_vat_rates lue par l'équipe (my_farm_ids), écrite par un owner
-- (is_farm_owner) ; order_counters lue par l'équipe, écrite par trigger seulement.
--   owner   : lit et modifie les taux, voit ses compteurs ;
--   membre  : lit les taux (pour saisir), ne les modifie pas (aucune ligne écrite) ;
--   étranger: ne voit rien (my_farm_ids vide pour cette ferme) ;
--   anonyme : aucun droit (revoke), auth.uid() null.
-- Aucune policy de lecture ne dépend d'une ligne insérée dans la même
-- instruction : my_farm_ids lit farm_members, que ces insertions ne touchent pas.
-- Retour arrière : bloc « -- down » commenté en fin de fichier.
-- ============================================================

-- ------------------------------------------------------------
-- A. Taux de TVA par ferme (paramétrage)
-- ------------------------------------------------------------
create table public.farm_vat_rates (
  id         uuid primary key default gen_random_uuid(),
  farm_id    uuid not null references public.farms(id) on delete cascade,
  categorie  text not null check (categorie in ('non_travaillee','travaillee','autre')),
  libelle    text not null check (length(trim(libelle)) > 0),
  taux_pb    integer not null check (taux_pb between 0 and 10000),
  actif      boolean not null default true,
  ordre      integer not null default 0,
  created_at timestamptz not null default now()
);
create index farm_vat_rates_farm_idx on public.farm_vat_rates(farm_id);
-- Un seul taux actif par catégorie principale (choix par défaut sans ambiguïté)
create unique index farm_vat_rates_categorie_uidx on public.farm_vat_rates(farm_id, categorie)
  where actif and categorie <> 'autre';
comment on table public.farm_vat_rates is
  'Taux de TVA de la ferme : paramétrage modifiable dans l''appli, jamais une constante du code.';
comment on column public.farm_vat_rates.taux_pb is 'Points de base : 1000 = 10 %, 550 = 5,5 %.';

-- Pré-remplissage : valeurs de départ à ce jour, modifiables ensuite.
create or replace function public.farm_vat_rates_initialiser(p_farm_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.farm_vat_rates (farm_id, categorie, libelle, taux_pb, ordre)
  select p_farm_id, x.categorie, x.libelle, x.taux_pb, x.ordre
  from (values ('non_travaillee', 'Fleur non travaillée', 1000, 1),
               ('travaillee',     'Fleur travaillée',     2000, 2)) as x(categorie, libelle, taux_pb, ordre)
  where not exists (select 1 from public.farm_vat_rates r where r.farm_id = p_farm_id and r.categorie = x.categorie);
$$;

do $$
declare f record;
begin
  for f in select id from public.farms loop perform public.farm_vat_rates_initialiser(f.id); end loop;
end $$;

create or replace function public.farm_creer_taux_tva()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.farm_vat_rates_initialiser(new.id);
  return new;
end; $$;
create trigger trg_farm_taux_tva after insert on public.farms
  for each row execute function public.farm_creer_taux_tva();

-- ------------------------------------------------------------
-- B. Régime de TVA de la ferme
-- ------------------------------------------------------------
alter table public.farm_billing add column assujettie_tva boolean not null default false;
alter table public.farm_billing add column numero_tva text
  check (numero_tva is null or numero_tva ~ '^[A-Z]{2}[0-9A-Z]{2,13}$');
comment on column public.farm_billing.assujettie_tva is
  'Vrai : factures avec TVA ventilée par taux. Faux : un seul total et la mention d''absence de TVA (010).';
comment on column public.farm_billing.numero_tva is 'Numéro de TVA intracommunautaire, sans espaces (ex. FR12345678901).';

-- ------------------------------------------------------------
-- C. Catégorie et taux sur les lignes de vente et de commande
-- ------------------------------------------------------------
alter table public.sale_lines  add column vat_rate_id uuid references public.farm_vat_rates(id) on delete set null;
alter table public.sale_lines  add column taux_tva_pb integer check (taux_tva_pb between 0 and 10000);
alter table public.order_lines add column vat_rate_id uuid references public.farm_vat_rates(id) on delete set null;
alter table public.order_lines add column taux_tva_pb integer check (taux_tva_pb between 0 and 10000);

-- Taux recopié de la catégorie, jamais fourni par l'appli. Catégorie de la
-- même ferme que la ligne, et active pour une nouvelle ligne.
create or replace function public.ligne_set_tva()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.farm_vat_rates%rowtype; v_farm uuid;
begin
  if new.vat_rate_id is null then
    new.taux_tva_pb := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.vat_rate_id is not distinct from old.vat_rate_id then
    new.taux_tva_pb := old.taux_tva_pb;
    return new;
  end if;
  select * into r from public.farm_vat_rates where id = new.vat_rate_id;
  select s.farm_id into v_farm from public.seasons s where s.id = new.season_id;
  if r.id is null or r.farm_id is distinct from v_farm then
    raise exception 'Catégorie de TVA % introuvable pour cette ferme', new.vat_rate_id;
  end if;
  if not r.actif then raise exception 'Catégorie de TVA « % » désactivée', r.libelle; end if;
  new.taux_tva_pb := r.taux_pb;
  return new;
end; $$;

-- Noms choisis pour passer APRÈS trg_*_line_season (season_id posé d'abord).
create trigger trg_sale_line_tva before insert or update on public.sale_lines
  for each row execute function public.ligne_set_tva();
create trigger trg_order_line_tva before insert or update on public.order_lines
  for each row execute function public.ligne_set_tva();

-- ------------------------------------------------------------
-- D. Numéro de bon de commande
-- ------------------------------------------------------------
create table public.order_counters (
  farm_id     uuid not null references public.farms(id) on delete cascade,
  year        integer not null check (year between 2000 and 2999),
  last_number integer not null default 0 check (last_number >= 0),
  primary key (farm_id, year)
);

alter table public.orders add column numero text;

-- Reprise : commandes existantes numérotées par ferme et année de création
with n as (
  select o.id, se.farm_id,
         extract(year from (o.created_at at time zone 'Europe/Paris'))::int as annee,
         row_number() over (partition by se.farm_id, extract(year from (o.created_at at time zone 'Europe/Paris'))
                            order by o.created_at, o.id) as rang
  from public.orders o join public.seasons se on se.id = o.season_id
)
update public.orders o set numero = 'BC' || n.annee || '-' || lpad(n.rang::text, 4, '0')
from n where n.id = o.id;

insert into public.order_counters (farm_id, year, last_number)
select se.farm_id, extract(year from (o.created_at at time zone 'Europe/Paris'))::int, count(*)
from public.orders o join public.seasons se on se.id = o.season_id
group by 1, 2;

create or replace function public.order_set_numero()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_annee int; v_n int;
begin
  if tg_op = 'UPDATE' then
    new.numero := old.numero;  -- figé
    return new;
  end if;
  select s.farm_id into v_farm from public.seasons s where s.id = new.season_id;
  if v_farm is null then raise exception 'Saison % introuvable', new.season_id; end if;
  v_annee := extract(year from (now() at time zone 'Europe/Paris'))::int;
  insert into public.order_counters (farm_id, year) values (v_farm, v_annee) on conflict do nothing;
  update public.order_counters set last_number = last_number + 1
   where farm_id = v_farm and year = v_annee
  returning last_number into v_n;  -- ligne verrouillée jusqu'à la fin de la transaction
  new.numero := 'BC' || v_annee || '-' || lpad(v_n::text, 4, '0');
  return new;
end; $$;
create trigger trg_order_numero before insert or update on public.orders
  for each row execute function public.order_set_numero();

-- ------------------------------------------------------------
-- E. Factures : régime, totaux et ventilation figés
-- ------------------------------------------------------------
alter table public.invoices add column assujettie_tva  boolean not null default false;
alter table public.invoices add column total_ht        numeric(12,2);
alter table public.invoices add column total_tva       numeric(12,2);
alter table public.invoices add column ventilation_tva jsonb not null default '[]'::jsonb;
alter table public.invoices add column commandes       jsonb not null default '[]'::jsonb;

-- Reprise (0 facture en production) : immuabilité suspendue le temps de l'update
alter table public.invoices disable trigger trg_invoices_immuables;
update public.invoices set total_ht = total, total_tva = 0 where total_ht is null;
alter table public.invoices enable trigger trg_invoices_immuables;

alter table public.invoices alter column total_ht set not null;
alter table public.invoices alter column total_tva set not null;
alter table public.invoices alter column mention_tva drop not null;
alter table public.invoices drop constraint invoices_mention_tva_check;
alter table public.invoices add constraint invoices_totaux_check check (total = total_ht + total_tva);
alter table public.invoices add constraint invoices_regime_tva_check check (
  (assujettie_tva and mention_tva is null)
  or (not assujettie_tva and total_tva = 0 and ventilation_tva = '[]'::jsonb
      and mention_tva is not null and length(trim(mention_tva)) > 0)
);
comment on column public.invoices.total is 'Montant dû en euros (TTC si assujettie). Facture ≥ 0 ; avoir ≤ 0.';
comment on column public.invoices.ventilation_tva is 'Figée : [{taux_pb, libelle, base_ht, tva, ttc}], par taux croissant.';
comment on column public.invoices.commandes is 'Figée : [{order_id, numero, date_livraison}] des bons d''origine.';

alter table public.invoice_lines add column vat_rate_id uuid;  -- instantané : pas de clé étrangère
alter table public.invoice_lines add column taux_tva_pb integer check (taux_tva_pb between 0 and 10000);
alter table public.invoice_lines add column libelle_tva text;
alter table public.invoice_lines add constraint invoice_lines_tva_check
  check ((taux_tva_pb is null) = (vat_rate_id is null));

-- Total, TVA et ventilation recalculés depuis les lignes en fin de transaction.
create or replace function public.invoice_verifier_total()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_somme numeric; v_n int; v_sans_taux int; v_tva numeric; v_ventil numeric;
begin
  select coalesce(sum(line_total), 0), count(*), count(*) filter (where taux_tva_pb is null)
    into v_somme, v_n, v_sans_taux
    from public.invoice_lines where invoice_id = new.id;
  if v_n = 0 then raise exception 'Facture % sans ligne', new.numero; end if;
  if v_somme <> new.total_ht then
    raise exception 'Facture % : total HT % différent de la somme des lignes %', new.numero, new.total_ht, v_somme;
  end if;
  if new.assujettie_tva then
    if v_sans_taux > 0 then raise exception 'Facture % : % ligne(s) sans taux de TVA', new.numero, v_sans_taux; end if;
    select coalesce(sum(round(b * t / 10000.0, 2)), 0) into v_tva
      from (select taux_tva_pb as t, sum(line_total) as b from public.invoice_lines
             where invoice_id = new.id group by taux_tva_pb) x;
    select coalesce(sum((e->>'tva')::numeric), 0) into v_ventil from jsonb_array_elements(new.ventilation_tva) e;
    if v_tva <> new.total_tva or v_ventil <> new.total_tva then
      raise exception 'Facture % : TVA % incohérente avec les lignes (%) ou la ventilation (%)', new.numero, new.total_tva, v_tva, v_ventil;
    end if;
  elsif v_sans_taux <> v_n then
    raise exception 'Facture % sans TVA : les lignes ne portent pas de taux', new.numero;
  end if;
  return null;
end; $$;

-- ------------------------------------------------------------
-- F. Fonctions d'écriture
-- ------------------------------------------------------------
-- Lignes : la catégorie suit ; le taux est posé par trg_*_line_tva.
create or replace function public._inserer_lignes_vente(p_sale_id uuid, p_lines jsonb)
returns void language sql set search_path = '' as $$
  insert into public.sale_lines (sale_id, culture_id, label, unit, quantity, stems_per_unit, unit_price, vat_rate_id)
  select p_sale_id, l.culture_id, l.label, coalesce(l.unit, 'tige'), l.quantity, coalesce(l.stems_per_unit, 1), l.unit_price, l.vat_rate_id
  from jsonb_to_recordset(p_lines)
    as l(culture_id uuid, label text, unit text, quantity numeric, stems_per_unit int, unit_price numeric, vat_rate_id uuid);
$$;

create or replace function public._inserer_lignes_commande(p_order_id uuid, p_lines jsonb)
returns void language sql set search_path = '' as $$
  insert into public.order_lines (order_id, culture_id, label, unit, quantity, stems_per_unit, unit_price, vat_rate_id)
  select p_order_id, l.culture_id, l.label, coalesce(l.unit, 'tige'), l.quantity, coalesce(l.stems_per_unit, 1), l.unit_price, l.vat_rate_id
  from jsonb_to_recordset(p_lines)
    as l(culture_id uuid, label text, unit text, quantity numeric, stems_per_unit int, unit_price numeric, vat_rate_id uuid);
$$;

-- Livrer : sans p_lines (null ou vide), les lignes de la commande sont
-- recopiées telles quelles, catégorie de TVA comprise : aucune ressaisie.
create or replace function public.livrer_commande(p_order_id uuid, p_sale jsonb, p_lines jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare o public.orders%rowtype; v_sale uuid; v_lines jsonb := p_lines;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Commande introuvable ou inaccessible'; end if;
  if o.sale_id is not null or o.status = 'livree' then raise exception 'Commande déjà livrée'; end if;
  if o.status = 'annulee' then raise exception 'Commande annulée'; end if;
  if v_lines is null or jsonb_array_length(v_lines) = 0 then
    select jsonb_agg(jsonb_build_object('culture_id', l.culture_id, 'label', l.label, 'unit', l.unit, 'quantity', l.quantity,
                                        'stems_per_unit', l.stems_per_unit, 'unit_price', l.unit_price, 'vat_rate_id', l.vat_rate_id)
                     order by l.created_at, l.id)
      into v_lines from public.order_lines l where l.order_id = o.id;
  end if;
  v_sale := public.enregistrer_vente(
    coalesce(p_sale, '{}'::jsonb) || jsonb_build_object('season_id', o.season_id, 'order_id', o.id,
                                 'client_id', coalesce(p_sale->>'client_id', o.client_id::text)),
    v_lines);
  update public.orders set sale_id = v_sale, status = 'livree' where id = o.id;
  return v_sale;
end; $$;

-- Champs obligatoires selon le régime de TVA.
create or replace function public._reglages_manquants(b public.farm_billing, p_professionnel boolean)
returns text[] language sql immutable set search_path = '' as $$
  select array_remove(array[
    case when nullif(trim(coalesce(b.raison_sociale, '')), '') is null then 'raison sociale' end,
    case when nullif(trim(coalesce(b.adresse, '')), '') is null then 'adresse' end,
    case when nullif(trim(coalesce(b.siret, '')), '') is null then 'SIREN ou SIRET' end,
    case when not coalesce(b.assujettie_tva, false) and nullif(trim(coalesce(b.mention_tva, '')), '') is null
         then 'mention d''absence de TVA' end,
    case when coalesce(b.assujettie_tva, false) and nullif(trim(coalesce(b.numero_tva, '')), '') is null
         then 'numéro de TVA intracommunautaire' end,
    case when p_professionnel and nullif(trim(coalesce(b.penalites_retard, '')), '') is null
         then 'taux des pénalités de retard (client professionnel)' end,
    case when p_professionnel and nullif(trim(coalesce(b.indemnite_recouvrement, '')), '') is null
         then 'indemnité forfaitaire de recouvrement (client professionnel)' end
  ], null);
$$;

create or replace function public._vendeur(b public.farm_billing)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'raison_sociale', trim(b.raison_sociale), 'adresse', trim(b.adresse), 'siret', b.siret,
    'email', nullif(trim(coalesce(b.email, '')), ''), 'telephone', nullif(trim(coalesce(b.telephone, '')), ''),
    'iban', nullif(trim(coalesce(b.iban, '')), ''), 'bic', nullif(trim(coalesce(b.bic, '')), ''),
    'mentions_libres', nullif(trim(coalesce(b.mentions_libres, '')), ''),
    'numero_tva', case when coalesce(b.assujettie_tva, false) then nullif(trim(coalesce(b.numero_tva, '')), '') end));
$$;

-- Lignes à facturer, avec leur catégorie de TVA : celle de la ligne (taux
-- recopié à la vente), sinon p_defaut (choisie à l'émission), sinon null.
drop function public._lignes_a_facturer(uuid[]);
create function public._lignes_a_facturer(p_sale_ids uuid[], p_defaut uuid)
returns table (sale_id uuid, sale_date date, culture_id uuid, label text, unit text, quantity numeric,
               stems_per_unit integer, unit_price numeric, line_total numeric, ordre bigint,
               vat_rate_id uuid, taux_tva_pb integer, libelle_tva text)
language sql stable set search_path = '' as $$
  select x.sale_id, x.sale_date, x.culture_id, x.label, x.unit, x.quantity, x.stems_per_unit,
         x.unit_price, round(x.quantity * x.unit_price, 2),
         row_number() over (order by x.sale_date, x.sale_created, x.sale_id, x.line_created, x.label, x.line_id),
         case when x.taux_tva_pb is not null then x.vat_rate_id else d.id end,
         case when x.taux_tva_pb is not null then x.taux_tva_pb else d.taux_pb end,
         case when x.taux_tva_pb is not null then r.libelle else d.libelle end
  from (
    select s.id as sale_id, s.date as sale_date, s.created_at as sale_created, sl.created_at as line_created,
           sl.id::text as line_id, sl.culture_id, sl.label, sl.unit, sl.quantity, sl.stems_per_unit, sl.unit_price,
           sl.vat_rate_id, sl.taux_tva_pb
      from public.sales s join public.sale_lines sl on sl.sale_id = s.id
     where s.id = any(p_sale_ids)
    union all
    select s.id, s.date, s.created_at, s.created_at, '', null,
           coalesce(nullif(trim(coalesce(s.cultures_sold, '')), ''), 'Fleurs coupées')
             || case when s.prix_unitaire = round(s.prix_unitaire, 2) and s.tiges > 0 then '' else ' (' || s.tiges || ' tiges)' end,
           case when s.prix_unitaire = round(s.prix_unitaire, 2) and s.tiges > 0 then 'tige' else 'autre' end,
           case when s.prix_unitaire = round(s.prix_unitaire, 2) and s.tiges > 0 then s.tiges else 1 end,
           1,
           case when s.prix_unitaire = round(s.prix_unitaire, 2) and s.tiges > 0 then s.prix_unitaire else s.total end,
           null::uuid, null::integer
      from public.sales s
     where s.id = any(p_sale_ids)
       and not exists (select 1 from public.sale_lines l where l.sale_id = s.id)
  ) x
  left join public.farm_vat_rates r on r.id = x.vat_rate_id
  left join public.farm_vat_rates d on d.id = p_defaut;
$$;

-- Émettre une facture sur une ou plusieurs ventes d'un même client.
-- p_options : {professionnel, delai_jours, client_siren, client_numero_tva,
--              adresse_livraison, notes,
--              vat_rate_id : catégorie à appliquer aux lignes qui n'en ont pas}
create or replace function public.emettre_facture(p_sale_ids uuid[], p_options jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_opt jsonb := coalesce(p_options, '{}'::jsonb);
  v_ids uuid[];
  v_n int; v_nb_fermes int; v_nb_clients int; v_sans_client int;
  v_farm uuid; v_season uuid; v_client uuid; v_debut date; v_fin date; v_somme numeric;
  v_deja text;
  b public.farm_billing%rowtype;
  c public.clients%rowtype;
  v_pro boolean; v_nom text; v_adresse text; v_assuj boolean;
  v_manque text[];
  v_defaut uuid := nullif(v_opt->>'vat_rate_id', '')::uuid;
  v_delai int; v_date date; v_annee int; v_seq int; v_numero text;
  v_ht numeric; v_tva numeric; v_sans_taux int; v_ventil jsonb; v_cmd jsonb;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_sale_ids, '{}'::uuid[])) x where x is not null;
  if v_ids is null then raise exception 'Aucune vente à facturer'; end if;
  if cardinality(v_ids) <> cardinality(p_sale_ids) then raise exception 'Liste de ventes invalide (doublon ou identifiant vide)'; end if;

  perform 1 from public.sales s where s.id = any(v_ids) order by s.id for update;
  select count(*), count(distinct se.farm_id), count(distinct s.client_id), count(*) filter (where s.client_id is null),
         min(se.farm_id::text)::uuid, min(s.client_id::text)::uuid, min(s.date), max(s.date), coalesce(sum(s.total), 0)
    into v_n, v_nb_fermes, v_nb_clients, v_sans_client, v_farm, v_client, v_debut, v_fin, v_somme
    from public.sales s join public.seasons se on se.id = s.season_id
   where s.id = any(v_ids) and s.season_id in (select public.my_season_ids());
  if v_n <> cardinality(v_ids) then raise exception 'Vente introuvable ou inaccessible' using errcode = '42501'; end if;
  if v_nb_fermes <> 1 or v_farm is null then raise exception 'Les ventes doivent appartenir à une même ferme'; end if;
  if v_sans_client > 0 and v_n > 1 then raise exception 'Une vente sans fiche client se facture seule'; end if;
  if v_nb_clients > 1 then raise exception 'Les ventes doivent être du même client'; end if;
  select s.season_id into v_season from public.sales s where s.id = any(v_ids)
   order by s.date desc, s.created_at desc limit 1;

  perform pg_advisory_xact_lock(hashtextextended('bleuenn-factures:' || v_farm::text, 0));

  select string_agg(distinct i.numero, ', ') into v_deja
    from public.invoice_sales x join public.invoices i on i.id = x.invoice_id
   where x.sale_id = any(v_ids) and x.liberee_par_avoir is null;
  if v_deja is not null then raise exception 'Vente déjà facturée (facture n° %)', v_deja; end if;

  select * into b from public.farm_billing where farm_id = v_farm;
  v_assuj := coalesce(b.assujettie_tva, false);
  if v_client is not null then
    select * into c from public.clients where id = v_client;
    v_nom := c.name; v_adresse := nullif(trim(coalesce(c.address, '')), '');
  else
    select nullif(trim(coalesce(s.client, '')), '') into v_nom from public.sales s where s.id = v_ids[1];
  end if;
  v_pro := coalesce((v_opt->>'professionnel')::boolean, c.kind in ('fleuriste','commerce','evenementiel'), false);

  v_manque := public._reglages_manquants(b, v_pro);
  if b.farm_id is null then v_manque := public._reglages_manquants(null::public.farm_billing, v_pro); end if;
  if v_pro and (v_nom is null or v_adresse is null) then
    v_manque := v_manque || 'nom et adresse du client (client professionnel)'::text;
  end if;
  if cardinality(v_manque) > 0 then
    raise exception 'Mentions obligatoires manquantes : %', array_to_string(v_manque, ', ')
      using hint = 'Complétez les réglages de facturation ou la fiche client.';
  end if;

  if v_defaut is not null and not exists (
       select 1 from public.farm_vat_rates where id = v_defaut and farm_id = v_farm and actif) then
    raise exception 'Catégorie de TVA % introuvable ou inactive pour cette ferme', v_defaut;
  end if;

  v_delai := coalesce((v_opt->>'delai_jours')::int, b.delai_paiement_jours, 0);
  if v_delai < 0 or v_delai > 365 then raise exception 'Délai de paiement invalide : % jours', v_delai; end if;

  -- Totaux HT et TVA par taux, sur les lignes telles qu'elles seront figées
  select coalesce(sum(l.line_total), 0), count(*) filter (where l.taux_tva_pb is null)
    into v_ht, v_sans_taux from public._lignes_a_facturer(v_ids, v_defaut) l;
  if v_ht <> v_somme then
    raise exception 'Incohérence : lignes % € pour des ventes à % €', v_ht, v_somme;
  end if;
  if v_assuj then
    if v_sans_taux > 0 then
      raise exception '% ligne(s) sans catégorie de TVA : choisissez la catégorie à leur appliquer', v_sans_taux;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('taux_pb', t, 'libelle', coalesce(lib, ''), 'base_ht', base,
                                                 'tva', tva, 'ttc', base + tva) order by t), '[]'::jsonb),
           coalesce(sum(tva), 0)
      into v_ventil, v_tva
      from (select l.taux_tva_pb as t, string_agg(distinct l.libelle_tva, ' / ') as lib, sum(l.line_total) as base,
                   round(sum(l.line_total) * l.taux_tva_pb / 10000.0, 2) as tva
              from public._lignes_a_facturer(v_ids, v_defaut) l group by l.taux_tva_pb) x;
  else
    v_ventil := '[]'::jsonb; v_tva := 0;
  end if;

  -- Bons de commande d'origine
  select coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'numero', o.numero, 'date_livraison', o.delivery_date)
                            order by o.delivery_date, o.numero), '[]'::jsonb)
    into v_cmd
    from public.orders o
   where o.id in (select s.order_id from public.sales s where s.id = any(v_ids) and s.order_id is not null)
      or o.sale_id = any(v_ids);

  v_date := (clock_timestamp() at time zone 'Europe/Paris')::date;
  v_annee := extract(year from v_date)::int;
  v_seq := public.prochain_numero(v_farm, 'facture', v_annee);
  v_numero := b.prefixe_facture || v_annee::text || '-' || lpad(v_seq::text, 4, '0');

  insert into public.invoices (farm_id, season_id, client_id, kind, numero, annee, sequence, date_emission,
    date_vente_debut, date_vente_fin, date_echeance, vendeur, acheteur, total, mention_tva,
    conditions_paiement, penalites_retard, indemnite_recouvrement, notes, created_by,
    assujettie_tva, total_ht, total_tva, ventilation_tva, commandes)
  values (v_farm, v_season, v_client, 'facture', v_numero, v_annee, v_seq, v_date,
    v_debut, v_fin, v_date + v_delai, public._vendeur(b),
    jsonb_strip_nulls(jsonb_build_object(
      'client_id', v_client, 'nom', v_nom, 'adresse', v_adresse,
      'email', nullif(trim(coalesce(c.email, '')), ''),
      'siren', nullif(trim(coalesce(v_opt->>'client_siren', '')), ''),
      'numero_tva', nullif(trim(coalesce(v_opt->>'client_numero_tva', '')), ''),
      'adresse_livraison', nullif(trim(coalesce(v_opt->>'adresse_livraison', '')), ''),
      'professionnel', v_pro)),
    v_ht + v_tva, case when v_assuj then null else trim(b.mention_tva) end,
    nullif(trim(coalesce(b.conditions_paiement, '')), ''),
    case when v_pro then trim(b.penalites_retard) end,
    case when v_pro then trim(b.indemnite_recouvrement) end,
    nullif(trim(coalesce(v_opt->>'notes', '')), ''), v_uid,
    v_assuj, v_ht, v_tva, v_ventil, v_cmd)
  returning id into v_id;

  insert into public.invoice_lines (invoice_id, farm_id, position, sale_id, sale_date, culture_id, label, unit,
    quantity, stems_per_unit, unit_price, line_total, vat_rate_id, taux_tva_pb, libelle_tva)
  select v_id, v_farm, l.ordre, l.sale_id, l.sale_date, l.culture_id, l.label, l.unit,
         l.quantity, l.stems_per_unit, l.unit_price, l.line_total,
         case when v_assuj then l.vat_rate_id end, case when v_assuj then l.taux_tva_pb end,
         case when v_assuj then l.libelle_tva end
    from public._lignes_a_facturer(v_ids, v_defaut) l;

  insert into public.invoice_sales (invoice_id, farm_id, sale_id)
  select v_id, v_farm, x from unnest(v_ids) x;

  return v_id;
end; $$;

-- Avoir total : tout en négatif, ventilation comprise, dans le régime de la facture.
create or replace function public.emettre_avoir(p_invoice_id uuid, p_motif text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  f public.invoices%rowtype;
  b public.farm_billing%rowtype;
  v_manque text[];
  v_mention text;
  v_date date; v_annee int; v_seq int; v_numero text; v_id uuid;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_motif, '')), '') is null then raise exception 'Le motif de l''avoir est obligatoire'; end if;

  select * into f from public.invoices
   where id = p_invoice_id and farm_id in (select public.my_farm_ids())
   for update;
  if not found then raise exception 'Facture introuvable ou inaccessible' using errcode = '42501'; end if;
  if f.kind <> 'facture' then raise exception 'Un avoir ne se corrige pas par un avoir'; end if;
  if f.annulee_par is not null then
    raise exception 'Facture % déjà annulée par l''avoir n° %', f.numero, (select numero from public.invoices where id = f.annulee_par);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bleuenn-factures:' || f.farm_id::text, 0));

  select * into b from public.farm_billing where farm_id = f.farm_id;
  v_manque := array_remove(array[
    case when nullif(trim(coalesce(b.raison_sociale, '')), '') is null then 'raison sociale' end,
    case when nullif(trim(coalesce(b.adresse, '')), '') is null then 'adresse' end,
    case when nullif(trim(coalesce(b.siret, '')), '') is null then 'SIREN ou SIRET' end,
    case when f.assujettie_tva and nullif(trim(coalesce(b.numero_tva, '')), '') is null
         then 'numéro de TVA intracommunautaire' end], null);
  if cardinality(v_manque) > 0 then
    raise exception 'Mentions obligatoires manquantes : %', array_to_string(v_manque, ', ');
  end if;
  -- Avoir sans TVA : mention actuelle, sinon celle de la facture corrigée
  v_mention := case when f.assujettie_tva then null
                    else coalesce(nullif(trim(coalesce(b.mention_tva, '')), ''), f.mention_tva) end;

  v_date := (clock_timestamp() at time zone 'Europe/Paris')::date;
  v_annee := extract(year from v_date)::int;
  v_seq := public.prochain_numero(f.farm_id, 'avoir', v_annee);
  v_numero := b.prefixe_avoir || v_annee::text || '-' || lpad(v_seq::text, 4, '0');

  insert into public.invoices (farm_id, season_id, client_id, kind, numero, annee, sequence, date_emission,
    date_vente_debut, date_vente_fin, date_echeance, vendeur, acheteur, total, mention_tva,
    conditions_paiement, notes, avoir_de, motif, created_by,
    assujettie_tva, total_ht, total_tva, ventilation_tva, commandes)
  values (f.farm_id, f.season_id, f.client_id, 'avoir', v_numero, v_annee, v_seq, v_date,
    f.date_vente_debut, f.date_vente_fin, null,
    public._vendeur(b) || case when f.assujettie_tva and f.vendeur ? 'numero_tva' and not (public._vendeur(b) ? 'numero_tva')
                               then jsonb_build_object('numero_tva', f.vendeur->'numero_tva') else '{}'::jsonb end,
    f.acheteur, -f.total, v_mention,
    null, null, f.id, trim(p_motif), v_uid,
    f.assujettie_tva, -f.total_ht, -f.total_tva,
    (select coalesce(jsonb_agg(jsonb_build_object('taux_pb', e->'taux_pb', 'libelle', e->'libelle',
                                                  'base_ht', -(e->>'base_ht')::numeric, 'tva', -(e->>'tva')::numeric,
                                                  'ttc', -(e->>'ttc')::numeric) order by k), '[]'::jsonb)
       from jsonb_array_elements(f.ventilation_tva) with ordinality as v(e, k)),
    f.commandes)
  returning id into v_id;

  insert into public.invoice_lines (invoice_id, farm_id, position, sale_id, sale_date, culture_id, label, unit,
    quantity, stems_per_unit, unit_price, line_total, vat_rate_id, taux_tva_pb, libelle_tva)
  select v_id, f.farm_id, l.position, l.sale_id, l.sale_date, l.culture_id, l.label, l.unit,
         l.quantity, l.stems_per_unit, -l.unit_price, -l.line_total, l.vat_rate_id, l.taux_tva_pb, l.libelle_tva
    from public.invoice_lines l where l.invoice_id = f.id;

  update public.invoices set annulee_par = v_id where id = f.id;
  update public.invoice_sales set liberee_par_avoir = v_id where invoice_id = f.id and liberee_par_avoir is null;
  return v_id;
end; $$;

-- Livrer ET facturer d'un bloc : si la facture est refusée (réglages
-- incomplets…), la livraison est annulée aussi. Security invoker :
-- livrer_commande passe par la RLS, emettre_facture contrôle l'appartenance.
-- Retour : {sale_id, invoice_id}.
create or replace function public.livrer_et_facturer(p_order_id uuid, p_sale jsonb, p_lines jsonb, p_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare v_sale uuid; v_inv uuid;
begin
  v_sale := public.livrer_commande(p_order_id, p_sale, p_lines);
  v_inv := public.emettre_facture(array[v_sale], p_options);
  return jsonb_build_object('sale_id', v_sale, 'invoice_id', v_inv);
end; $$;

-- ------------------------------------------------------------
-- G. Vue de statut : totaux HT et TVA ajoutés en fin de liste
-- ------------------------------------------------------------
create or replace view public.invoices_status with (security_invoker = true) as
select i.id, i.farm_id, i.season_id, i.client_id, i.kind, i.numero, i.date_emission, i.date_echeance,
       i.total, i.acheteur->>'nom' as client_nom, i.avoir_de, i.annulee_par, l.numero as numero_lie,
       coalesce(p.paye, 0) as paye,
       case when i.kind = 'avoir' then 0
            when i.annulee_par is not null then -coalesce(p.paye, 0)
            else i.total - coalesce(p.paye, 0) end as reste_du,
       case when i.kind = 'avoir' then 'avoir'
            when i.annulee_par is not null then 'annulee'
            when coalesce(p.paye, 0) >= i.total then 'payee'
            when i.date_echeance < (now() at time zone 'Europe/Paris')::date then 'en_retard'
            when coalesce(p.paye, 0) > 0 then 'partielle'
            else 'a_payer' end as statut,
       case when i.kind = 'facture' and i.annulee_par is null and coalesce(p.paye, 0) < i.total
                 and i.date_echeance < (now() at time zone 'Europe/Paris')::date
            then (now() at time zone 'Europe/Paris')::date - i.date_echeance end as jours_de_retard,
       i.total_ht, i.total_tva
from public.invoices i
left join (select invoice_id, sum(amount) as paye from public.payments group by invoice_id) p on p.invoice_id = i.id
left join public.invoices l on l.id = coalesce(i.annulee_par, i.avoir_de);

-- ------------------------------------------------------------
-- H. RLS
-- ------------------------------------------------------------
alter table public.farm_vat_rates enable row level security;
alter table public.order_counters enable row level security;

create policy "taux de TVA : lecture équipe" on public.farm_vat_rates for select to authenticated
  using (farm_id in (select public.my_farm_ids()));
create policy "taux de TVA : création owner" on public.farm_vat_rates for insert to authenticated
  with check (public.is_farm_owner(farm_id));
create policy "taux de TVA : modification owner" on public.farm_vat_rates for update to authenticated
  using (public.is_farm_owner(farm_id)) with check (public.is_farm_owner(farm_id));

-- Écrit par trigger seulement
create policy "compteurs de commandes : lecture équipe" on public.order_counters for select to authenticated
  using (farm_id in (select public.my_farm_ids()));

-- ------------------------------------------------------------
-- I. Droits
-- ------------------------------------------------------------
revoke all on public.farm_vat_rates, public.order_counters from anon;
revoke delete, truncate on public.farm_vat_rates from authenticated;
revoke insert, update, delete, truncate on public.order_counters from authenticated;
-- Numéro de commande et taux de ligne : posés par trigger (la valeur
-- envoyée est écrasée), rien à retirer côté colonnes.

revoke execute on function
  public.farm_vat_rates_initialiser(uuid), public.farm_creer_taux_tva(), public.ligne_set_tva(),
  public.order_set_numero(), public._lignes_a_facturer(uuid[], uuid)
from public, anon, authenticated;
revoke execute on function public.livrer_et_facturer(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.livrer_et_facturer(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------
-- -- down (à exécuter à la main, AVANT toute facture avec TVA : une facture
-- -- émise doit être conservée ; recharger ensuite les fonctions de 007 et 010)
-- drop function public.livrer_et_facturer(uuid, jsonb, jsonb, jsonb);
-- drop view public.invoices_status;            -- puis recréer celle de 010 (section G)
-- drop function public._lignes_a_facturer(uuid[], uuid);
-- -- recréer _lignes_a_facturer(uuid[]), emettre_facture, emettre_avoir,
-- -- _reglages_manquants, _vendeur, invoice_verifier_total (010) et
-- -- _inserer_lignes_vente, _inserer_lignes_commande, livrer_commande (007)
-- alter table public.invoice_lines drop constraint invoice_lines_tva_check;
-- alter table public.invoice_lines drop column libelle_tva, drop column taux_tva_pb, drop column vat_rate_id;
-- alter table public.invoices drop constraint invoices_regime_tva_check, drop constraint invoices_totaux_check;
-- alter table public.invoices alter column mention_tva set not null;   -- échoue s'il existe une facture avec TVA
-- alter table public.invoices add constraint invoices_mention_tva_check check (length(trim(mention_tva)) > 0);
-- alter table public.invoices drop column commandes, drop column ventilation_tva, drop column total_tva,
--   drop column total_ht, drop column assujettie_tva;
-- drop trigger trg_order_numero on public.orders;
-- drop function public.order_set_numero();
-- alter table public.orders drop column numero;
-- drop table public.order_counters;
-- drop trigger trg_sale_line_tva on public.sale_lines;
-- drop trigger trg_order_line_tva on public.order_lines;
-- drop function public.ligne_set_tva();
-- alter table public.sale_lines drop column taux_tva_pb, drop column vat_rate_id;
-- alter table public.order_lines drop column taux_tva_pb, drop column vat_rate_id;
-- alter table public.farm_billing drop column numero_tva, drop column assujettie_tva;
-- drop trigger trg_farm_taux_tva on public.farms;
-- drop function public.farm_creer_taux_tva();
-- drop function public.farm_vat_rates_initialiser(uuid);
-- drop table public.farm_vat_rates;
-- ------------------------------------------------------------
