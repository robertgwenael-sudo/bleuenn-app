-- ============================================================
-- 010 : factures, avoirs et paiements
-- ============================================================
-- L'agricultrice ne facture pas de TVA. Une facture porte donc un seul
-- « Total », sans taux ni montant de TVA, et une mention qui justifie
-- l'absence de TVA. Cette mention dépend du régime : elle n'est JAMAIS
-- écrite ici, elle est saisie mot pour mot dans les réglages
-- (farm_billing.mention_tva) d'après le comptable, puis figée sur chaque
-- facture émise. Idem pour les pénalités de retard et l'indemnité
-- forfaitaire de recouvrement : des textes saisis, jamais des valeurs codées.
--
-- Choix :
--  * farm_billing : une ligne par ferme, identité de facturation. Lue par
--    toute l'équipe, modifiée par un owner seulement ;
--  * numérotation : invoice_counters (ferme, nature, année) et
--    prochain_numero(), qui verrouille la ligne du compteur (FOR UPDATE)
--    dans la transaction d'émission. Jamais une séquence : une séquence
--    n'est pas transactionnelle et laisse des trous au rollback. Ici, un
--    rollback rend le numéro. Deux séries continues par année :
--    F2026-0001… pour les factures, AV2026-0001… pour les avoirs (préfixes
--    réglables). Un verrou consultatif par ferme sérialise les émissions :
--    la date d'émission est lue APRÈS ce verrou, donc l'ordre des numéros
--    suit l'ordre des dates ;
--  * invoices : en-tête figé. Vendeur et acheteur sont des instantanés
--    jsonb pris à l'émission : modifier ensuite le client ou les réglages
--    ne change pas une facture émise. La page d'impression ne lit que ces
--    instantanés ;
--  * invoice_lines : instantané des lignes, recopiées des sale_lines (ou de
--    l'en-tête pour une vente ancienne sans lignes) ;
--  * invoice_sales : lien facture ↔ ventes. Une facture peut regrouper
--    plusieurs ventes d'un même client (facture mensuelle d'un fleuriste).
--    Une vente n'est facturée qu'une fois : index unique partiel sur
--    sale_id parmi les liens non libérés. Un avoir libère les liens
--    (liberee_par_avoir) et la vente redevient facturable ;
--  * AVOIR : total, au montant NÉGATIF. Un avoir est une ligne de invoices
--    de nature 'avoir', avoir_de = la facture corrigée, total = −total de la
--    facture, lignes recopiées avec prix unitaires et totaux négatifs. Ainsi
--    facture + avoir = 0 et la somme des totaux donne le chiffre facturé
--    net. La facture corrigée reçoit annulee_par = l'avoir (seule
--    modification jamais permise sur une facture émise). Pas d'avoir
--    partiel : pour corriger une ligne, avoir total puis nouvelle facture ;
--  * immuabilité : aucun UPDATE ni DELETE possible depuis l'appli (droits
--    retirés, aucune policy d'écriture), et des triggers refusent toute
--    modification même avec la clé de service, sauf annulee_par (une fois)
--    et la libération des liens de vente ;
--  * paiements : montant non nul. Un paiement erroné ne se supprime pas :
--    on enregistre sa CONTRE-PASSATION, un paiement négatif du même montant
--    qui référence le paiement annulé (contrepasse_de). Seul autre montant
--    négatif admis : le remboursement d'un trop-perçu sur une facture
--    annulée par avoir. Un encaissement ne peut pas dépasser le reste dû ;
--  * les ventes facturées sont protégées : ni suppression, ni changement de
--    montant, de date, de client ou de lignes tant que la facture n'est pas
--    annulée par un avoir ;
--  * statut (à payer, partielle, payée, en retard, annulée) : calculé à la
--    lecture par la vue invoices_status, à la date de Paris. Rien de dérivé
--    de la date du jour n'est stocké ;
--  * fonctions : emettre_facture et emettre_avoir sont SECURITY DEFINER par
--    nécessité. En security invoker, il faudrait ouvrir l'INSERT sur
--    invoices à l'appli, et n'importe quel membre pourrait insérer une
--    facture au numéro de son choix en contournant le compteur. Elles
--    vérifient donc elles-mêmes l'appartenance (my_season_ids,
--    my_farm_ids) et search_path = ''. prochain_numero n'est exécutable par
--    personne d'autre (sinon on brûlerait des numéros, donc des trous).
--    enregistrer_paiement est SECURITY INVOKER : les contrôles sont dans un
--    trigger, qui s'applique aussi à un INSERT direct ;
--  * montants en numeric(12,2), comme le reste du schéma ; l'appli calcule
--    en centimes (src/lib/domain/factures.ts).
-- Retour arrière : voir le bloc commenté en fin de fichier.
-- ============================================================

-- ------------------------------------------------------------
-- A. Réglages de facturation (une ligne par ferme)
-- ------------------------------------------------------------
create table public.farm_billing (
  farm_id                 uuid primary key references public.farms(id) on delete cascade,
  raison_sociale          text,
  adresse                 text,
  siret                   text check (siret is null or siret ~ '^[0-9]{9}([0-9]{5})?$'),
  email                   text,
  telephone               text,
  mention_tva             text,
  delai_paiement_jours    integer check (delai_paiement_jours is null or delai_paiement_jours between 0 and 365),
  conditions_paiement     text,
  penalites_retard        text,
  indemnite_recouvrement  text,
  iban                    text,
  bic                     text,
  mentions_libres         text,
  prefixe_facture         text not null default 'F'  check (prefixe_facture ~ '^[A-Za-z0-9-]{1,10}$'),
  prefixe_avoir           text not null default 'AV' check (prefixe_avoir ~ '^[A-Za-z0-9-]{1,10}$'),
  updated_by              uuid default auth.uid(),
  updated_at              timestamptz not null default now(),
  check (upper(prefixe_facture) <> upper(prefixe_avoir))
);
comment on column public.farm_billing.siret is 'SIREN (9 chiffres) ou SIRET (14 chiffres), chiffres seuls.';
comment on column public.farm_billing.mention_tva is
  'Mention justifiant l''absence de TVA, saisie mot pour mot d''après le comptable. Jamais de valeur par défaut.';
comment on column public.farm_billing.delai_paiement_jours is 'Délai de paiement par défaut ; null ou 0 = à réception.';

create or replace function public.farm_billing_touch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end; $$;
create trigger trg_farm_billing_touch before insert or update on public.farm_billing
  for each row execute function public.farm_billing_touch();

-- ------------------------------------------------------------
-- B. Compteurs de numérotation
-- ------------------------------------------------------------
create table public.invoice_counters (
  farm_id     uuid not null references public.farms(id) on delete restrict,
  kind        text not null check (kind in ('facture','avoir')),
  year        integer not null check (year between 2000 and 2999),
  last_number integer not null default 0 check (last_number >= 0),
  primary key (farm_id, kind, year)
);

-- Prend le numéro suivant, ligne du compteur verrouillée jusqu'à la fin de
-- la transaction : un rollback rend le numéro, deux émissions simultanées
-- s'attendent. Réservée aux fonctions d'émission (droits retirés plus bas).
create or replace function public.prochain_numero(p_farm_id uuid, p_kind text, p_year integer)
returns integer language plpgsql set search_path = '' as $$
declare v_n integer;
begin
  insert into public.invoice_counters (farm_id, kind, year, last_number)
  values (p_farm_id, p_kind, p_year, 0)
  on conflict do nothing;
  select last_number into v_n from public.invoice_counters
   where farm_id = p_farm_id and kind = p_kind and year = p_year
   for update;
  v_n := v_n + 1;
  update public.invoice_counters set last_number = v_n
   where farm_id = p_farm_id and kind = p_kind and year = p_year;
  return v_n;
end; $$;

-- ------------------------------------------------------------
-- C. Factures et avoirs
-- ------------------------------------------------------------
create table public.invoices (
  id                     uuid primary key default gen_random_uuid(),
  farm_id                uuid not null references public.farms(id) on delete restrict,
  season_id              uuid not null references public.seasons(id) on delete restrict,
  client_id              uuid references public.clients(id) on delete restrict,
  kind                   text not null check (kind in ('facture','avoir')),
  numero                 text not null,
  annee                  integer not null,
  sequence               integer not null check (sequence > 0),
  date_emission          date not null,
  date_vente_debut       date not null,
  date_vente_fin         date not null,
  date_echeance          date,
  vendeur                jsonb not null,
  acheteur               jsonb not null,
  total                  numeric(12,2) not null,
  mention_tva            text not null check (length(trim(mention_tva)) > 0),
  conditions_paiement    text,
  penalites_retard       text,
  indemnite_recouvrement text,
  notes                  text,
  avoir_de               uuid references public.invoices(id) on delete restrict,
  motif                  text,
  annulee_par            uuid references public.invoices(id) on delete restrict,
  created_by             uuid not null,  -- pas de clé étrangère : la facture survit au compte de son auteur
  created_at             timestamptz not null default now(),
  unique (farm_id, numero),
  unique (farm_id, kind, annee, sequence),
  check (date_vente_debut <= date_vente_fin),
  check (date_echeance is null or date_echeance >= date_emission),
  check (
    (kind = 'facture' and total >= 0 and avoir_de is null and motif is null)
    or (kind = 'avoir' and total <= 0 and avoir_de is not null and length(trim(motif)) > 0
        and annulee_par is null and date_echeance is null)
  )
);
-- Un seul avoir (total) par facture
create unique index invoices_avoir_de_uidx on public.invoices(avoir_de) where avoir_de is not null;
create index invoices_farm_date_idx on public.invoices(farm_id, date_emission desc);
create index invoices_season_idx on public.invoices(season_id);
create index invoices_client_idx on public.invoices(client_id) where client_id is not null;
comment on column public.invoices.total is 'Total en euros. Facture ≥ 0 ; avoir ≤ 0 (montant négatif, = −total de la facture corrigée).';
comment on column public.invoices.acheteur is
  'Instantané figé : {client_id, nom, adresse, email, siren, adresse_livraison, professionnel}.';
comment on column public.invoices.vendeur is
  'Instantané figé : {raison_sociale, adresse, siret, email, telephone, iban, bic, mentions_libres}.';

create table public.invoice_lines (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references public.invoices(id) on delete restrict,
  farm_id        uuid not null references public.farms(id) on delete restrict,
  position       integer not null check (position > 0),
  sale_id        uuid,         -- instantané : pas de clé étrangère
  sale_date      date,
  culture_id     uuid,         -- instantané : pas de clé étrangère
  label          text not null check (length(trim(label)) > 0),
  unit           text not null check (unit in ('tige','botte','bouquet','seau','autre')),
  quantity       numeric(10,2) not null check (quantity > 0),
  stems_per_unit integer not null default 1 check (stems_per_unit > 0),
  unit_price     numeric(10,2) not null,
  line_total     numeric(12,2) not null,
  unique (invoice_id, position),
  check (line_total = round(quantity * unit_price, 2))
);
create index invoice_lines_invoice_idx on public.invoice_lines(invoice_id);

create table public.invoice_sales (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id) on delete restrict,
  farm_id           uuid not null references public.farms(id) on delete restrict,
  -- set null : une vente libérée par un avoir peut ensuite être supprimée
  -- (le trigger factures_proteger_vente refuse la suppression d'une vente
  -- encore facturée, avant que cette action ne s'applique).
  sale_id           uuid references public.sales(id) on delete set null,
  liberee_par_avoir uuid references public.invoices(id) on delete restrict,
  created_at        timestamptz not null default now(),
  check (sale_id is not null or liberee_par_avoir is not null)
);
-- Une vente n'est facturée qu'une fois (hors avoir)
create unique index invoice_sales_vente_active_uidx on public.invoice_sales(sale_id)
  where liberee_par_avoir is null;
create index invoice_sales_invoice_idx on public.invoice_sales(invoice_id);
create index invoice_sales_sale_idx on public.invoice_sales(sale_id);

-- ------------------------------------------------------------
-- D. Paiements
-- ------------------------------------------------------------
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references public.invoices(id) on delete restrict,
  farm_id        uuid not null references public.farms(id) on delete restrict,
  date           date not null,
  amount         numeric(12,2) not null check (amount <> 0),
  mode           text not null check (mode in ('especes','cheque','virement','carte','autre')),
  reference      text,
  notes          text,
  contrepasse_de uuid references public.payments(id) on delete restrict,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  check (contrepasse_de is null or amount < 0)
);
create unique index payments_contrepasse_uidx on public.payments(contrepasse_de) where contrepasse_de is not null;
create index payments_invoice_idx on public.payments(invoice_id, date);
comment on column public.payments.amount is
  'Encaissement > 0. Négatif seulement pour une contre-passation (contrepasse_de) ou le remboursement d''une facture annulée.';

-- ------------------------------------------------------------
-- E. Cohérence et immuabilité
-- ------------------------------------------------------------
-- Total de l'en-tête = somme des lignes, au moins une ligne (vérifié en fin
-- de transaction : l'en-tête est inséré avant ses lignes).
create or replace function public.invoice_verifier_total()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_somme numeric; v_n int;
begin
  select coalesce(sum(line_total), 0), count(*) into v_somme, v_n
    from public.invoice_lines where invoice_id = new.id;
  if v_n = 0 then raise exception 'Facture % sans ligne', new.numero; end if;
  if v_somme <> new.total then
    raise exception 'Facture % : total % différent de la somme des lignes %', new.numero, new.total, v_somme;
  end if;
  return null;
end; $$;
create constraint trigger trg_invoice_verifier_total after insert on public.invoices
  deferrable initially deferred for each row execute function public.invoice_verifier_total();

create or replace function public.factures_immuables()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Table % : un document émis ne se supprime pas', tg_table_name;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Table % : un document émis ne se supprime pas (émettre un avoir, ou contre-passer un paiement)', tg_table_name;
  end if;
  -- UPDATE
  if tg_table_name = 'invoices' then
    -- Seule évolution permise : annulee_par posé une fois, par emettre_avoir.
    if old.annulee_par is null and new.annulee_par is not null
       and (to_jsonb(new) - 'annulee_par') = (to_jsonb(old) - 'annulee_par') then
      return new;
    end if;
    raise exception 'Facture % émise : elle ne se modifie plus (émettre un avoir)', old.numero;
  end if;
  if tg_table_name = 'invoice_sales' then
    -- Libération par un avoir, puis éventuellement suppression de la vente libérée.
    if old.liberee_par_avoir is null and new.liberee_par_avoir is not null
       and (to_jsonb(new) - 'liberee_par_avoir') = (to_jsonb(old) - 'liberee_par_avoir') then
      return new;
    end if;
    if old.liberee_par_avoir is not null and new.sale_id is null
       and (to_jsonb(new) - 'sale_id') = (to_jsonb(old) - 'sale_id') then
      return new;
    end if;
    raise exception 'Lien facture-vente figé';
  end if;
  raise exception 'Table % : un document émis ne se modifie plus', tg_table_name;
end; $$;

create trigger trg_invoices_immuables before update or delete on public.invoices
  for each row execute function public.factures_immuables();
create trigger trg_invoice_lines_immuables before update or delete on public.invoice_lines
  for each row execute function public.factures_immuables();
create trigger trg_invoice_sales_immuables before update or delete on public.invoice_sales
  for each row execute function public.factures_immuables();
create trigger trg_payments_immuables before update or delete on public.payments
  for each row execute function public.factures_immuables();
create trigger trg_invoices_no_truncate before truncate on public.invoices
  for each statement execute function public.factures_immuables();
create trigger trg_invoice_lines_no_truncate before truncate on public.invoice_lines
  for each statement execute function public.factures_immuables();
create trigger trg_invoice_sales_no_truncate before truncate on public.invoice_sales
  for each statement execute function public.factures_immuables();
create trigger trg_payments_no_truncate before truncate on public.payments
  for each statement execute function public.factures_immuables();

-- Une vente facturée (lien non libéré) ne se supprime pas et ne change ni de
-- montant, ni de date, ni de client, ni de lignes.
create or replace function public.factures_proteger_vente()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sale uuid; v_num text;
begin
  if tg_table_name = 'sales' then
    v_sale := old.id;
    if tg_op = 'UPDATE'
       and new.date is not distinct from old.date
       and new.total is not distinct from old.total
       and new.tiges is not distinct from old.tiges
       and new.prix_unitaire is not distinct from old.prix_unitaire
       and new.client_id is not distinct from old.client_id
       and new.client is not distinct from old.client
       and new.season_id is not distinct from old.season_id
       and new.cultures_sold is not distinct from old.cultures_sold then
      return new;
    end if;
  else -- sale_lines
    v_sale := case when tg_op = 'INSERT' then new.sale_id else old.sale_id end;
  end if;

  select i.numero into v_num
    from public.invoice_sales x join public.invoices i on i.id = x.invoice_id
   where x.sale_id = v_sale and x.liberee_par_avoir is null
   limit 1;
  -- PL/pgSQL n'évalue pas en court-circuit : new.sale_id n'existe pas sur
  -- sales, d'où les if imbriqués.
  if v_num is null and tg_table_name = 'sale_lines' and tg_op = 'UPDATE' then
    if new.sale_id <> old.sale_id then
      select i.numero into v_num
        from public.invoice_sales x join public.invoices i on i.id = x.invoice_id
       where x.sale_id = new.sale_id and x.liberee_par_avoir is null
       limit 1;
    end if;
  end if;
  if v_num is not null then
    raise exception 'Vente facturée (facture n° %) : émettez un avoir avant de la modifier ou de la supprimer', v_num;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end; $$;

create trigger trg_sales_facturees before update or delete on public.sales
  for each row execute function public.factures_proteger_vente();
create trigger trg_sale_lines_facturees before insert or update or delete on public.sale_lines
  for each row execute function public.factures_proteger_vente();

-- Paiements : ferme recopiée de la facture, montant contrôlé sous verrou.
create or replace function public.paiement_controler()
returns trigger language plpgsql security definer set search_path = '' as $$
declare f public.invoices%rowtype; v_paye numeric; o public.payments%rowtype;
begin
  select * into f from public.invoices where id = new.invoice_id for update;
  if not found or (auth.uid() is not null and f.farm_id not in (select public.my_farm_ids())) then
    raise exception 'Facture introuvable ou inaccessible' using errcode = '42501';
  end if;
  if f.kind <> 'facture' then
    raise exception 'Un paiement s''enregistre sur une facture, pas sur un avoir';
  end if;
  new.farm_id := f.farm_id;
  new.created_by := auth.uid();
  select coalesce(sum(amount), 0) into v_paye from public.payments where invoice_id = f.id;

  if new.amount > 0 then
    if new.contrepasse_de is not null then
      raise exception 'Une contre-passation est un montant négatif';
    end if;
    if f.annulee_par is not null then
      raise exception 'Facture % annulée par avoir : aucun encaissement possible', f.numero;
    end if;
    if v_paye + new.amount > f.total then
      raise exception 'Le paiement (% €) dépasse le reste dû (% €)', new.amount, f.total - v_paye;
    end if;
  else
    if new.contrepasse_de is not null then
      select * into o from public.payments where id = new.contrepasse_de;
      if not found or o.invoice_id <> f.id then
        raise exception 'Paiement à contre-passer introuvable sur cette facture';
      end if;
      if o.amount <= 0 then raise exception 'On ne contre-passe qu''un encaissement'; end if;
      if exists (select 1 from public.payments where contrepasse_de = o.id) then
        raise exception 'Ce paiement est déjà contre-passé';
      end if;
      if new.amount <> -o.amount then
        raise exception 'Une contre-passation reprend exactement le montant du paiement (−% €)', o.amount;
      end if;
    elsif f.annulee_par is null then
      raise exception 'Un montant négatif contre-passe un paiement précis (ou rembourse une facture annulée)';
    elsif nullif(trim(coalesce(new.notes, '')), '') is null then
      raise exception 'Un remboursement doit être expliqué (notes)';
    end if;
    if v_paye + new.amount < 0 then
      raise exception 'Le remboursement dépasse ce qui a été encaissé (% €)', v_paye;
    end if;
  end if;
  return new;
end; $$;
create trigger trg_payments_controler before insert on public.payments
  for each row execute function public.paiement_controler();

-- ------------------------------------------------------------
-- F. Fonctions d'émission
-- ------------------------------------------------------------
-- Champs obligatoires des réglages, en clair pour le message d'erreur.
create or replace function public._reglages_manquants(b public.farm_billing, p_professionnel boolean)
returns text[] language sql immutable set search_path = '' as $$
  select array_remove(array[
    case when nullif(trim(coalesce(b.raison_sociale, '')), '') is null then 'raison sociale' end,
    case when nullif(trim(coalesce(b.adresse, '')), '') is null then 'adresse' end,
    case when nullif(trim(coalesce(b.siret, '')), '') is null then 'SIREN ou SIRET' end,
    case when nullif(trim(coalesce(b.mention_tva, '')), '') is null then 'mention d''absence de TVA' end,
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
    'mentions_libres', nullif(trim(coalesce(b.mentions_libres, '')), '')));
$$;

-- Lignes à facturer : celles de sale_lines, ou une ligne tirée de l'en-tête
-- pour une vente ancienne sans lignes (tiges × prix si le prix tombe au
-- centime, sinon 1 × total, tiges rappelées dans le libellé).
-- Ordre : vente par vente (date), puis libellé : les lignes d'une même vente
-- partagent leur created_at (une seule instruction), pas d'ordre de saisie fiable.
create or replace function public._lignes_a_facturer(p_sale_ids uuid[])
returns table (sale_id uuid, sale_date date, culture_id uuid, label text, unit text, quantity numeric,
               stems_per_unit integer, unit_price numeric, line_total numeric, ordre bigint)
language sql stable set search_path = '' as $$
  select x.sale_id, x.sale_date, x.culture_id, x.label, x.unit, x.quantity, x.stems_per_unit,
         x.unit_price, round(x.quantity * x.unit_price, 2),
         row_number() over (order by x.sale_date, x.sale_created, x.sale_id, x.line_created, x.label, x.line_id)
  from (
    select s.id as sale_id, s.date as sale_date, s.created_at as sale_created, sl.created_at as line_created,
           sl.id::text as line_id, sl.culture_id, sl.label, sl.unit, sl.quantity, sl.stems_per_unit, sl.unit_price
      from public.sales s join public.sale_lines sl on sl.sale_id = s.id
     where s.id = any(p_sale_ids)
    union all
    select s.id, s.date, s.created_at, s.created_at, '', null,
           coalesce(nullif(trim(coalesce(s.cultures_sold, '')), ''), 'Fleurs coupées')
             || case when s.prix_unitaire = round(s.prix_unitaire, 2) and s.tiges > 0 then '' else ' (' || s.tiges || ' tiges)' end,
           case when s.prix_unitaire = round(s.prix_unitaire, 2) and s.tiges > 0 then 'tige' else 'autre' end,
           case when s.prix_unitaire = round(s.prix_unitaire, 2) and s.tiges > 0 then s.tiges else 1 end,
           1,
           case when s.prix_unitaire = round(s.prix_unitaire, 2) and s.tiges > 0 then s.prix_unitaire else s.total end
      from public.sales s
     where s.id = any(p_sale_ids)
       and not exists (select 1 from public.sale_lines l where l.sale_id = s.id)
  ) x;
$$;

-- Émettre une facture sur une ou plusieurs ventes d'un même client.
-- p_options : {professionnel: bool (défaut : selon le type de client),
--              delai_jours: int (défaut : réglages), client_siren: text,
--              adresse_livraison: text, notes: text}
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
  v_pro boolean; v_nom text; v_adresse text;
  v_manque text[];
  v_delai int; v_date date; v_annee int; v_seq int; v_numero text; v_total numeric;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_sale_ids, '{}'::uuid[])) x where x is not null;
  if v_ids is null then raise exception 'Aucune vente à facturer'; end if;
  if cardinality(v_ids) <> cardinality(p_sale_ids) then raise exception 'Liste de ventes invalide (doublon ou identifiant vide)'; end if;

  -- Ventes verrouillées (ordre stable : pas d'interblocage). Fonction
  -- security definer : la RLS ne filtre pas, l'appartenance est vérifiée ici.
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

  -- Une émission à la fois par ferme : la date est lue après le verrou,
  -- l'ordre des numéros suit donc l'ordre des dates.
  perform pg_advisory_xact_lock(hashtextextended('bleuenn-factures:' || v_farm::text, 0));

  select string_agg(distinct i.numero, ', ') into v_deja
    from public.invoice_sales x join public.invoices i on i.id = x.invoice_id
   where x.sale_id = any(v_ids) and x.liberee_par_avoir is null;
  if v_deja is not null then raise exception 'Vente déjà facturée (facture n° %)', v_deja; end if;

  select * into b from public.farm_billing where farm_id = v_farm;
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

  v_delai := coalesce((v_opt->>'delai_jours')::int, b.delai_paiement_jours, 0);
  if v_delai < 0 or v_delai > 365 then raise exception 'Délai de paiement invalide : % jours', v_delai; end if;

  v_date := (clock_timestamp() at time zone 'Europe/Paris')::date;
  v_annee := extract(year from v_date)::int;
  v_seq := public.prochain_numero(v_farm, 'facture', v_annee);
  v_numero := b.prefixe_facture || v_annee::text || '-' || lpad(v_seq::text, 4, '0');

  select coalesce(sum(l.line_total), 0) into v_total from public._lignes_a_facturer(v_ids) l;
  if v_total <> v_somme then
    raise exception 'Incohérence : lignes % € pour des ventes à % €', v_total, v_somme;
  end if;

  insert into public.invoices (farm_id, season_id, client_id, kind, numero, annee, sequence, date_emission,
    date_vente_debut, date_vente_fin, date_echeance, vendeur, acheteur, total, mention_tva,
    conditions_paiement, penalites_retard, indemnite_recouvrement, notes, created_by)
  values (v_farm, v_season, v_client, 'facture', v_numero, v_annee, v_seq, v_date,
    v_debut, v_fin, v_date + v_delai, public._vendeur(b),
    jsonb_strip_nulls(jsonb_build_object(
      'client_id', v_client, 'nom', v_nom, 'adresse', v_adresse,
      'email', nullif(trim(coalesce(c.email, '')), ''),
      'siren', nullif(trim(coalesce(v_opt->>'client_siren', '')), ''),
      'adresse_livraison', nullif(trim(coalesce(v_opt->>'adresse_livraison', '')), ''),
      'professionnel', v_pro)),
    v_total, trim(b.mention_tva), nullif(trim(coalesce(b.conditions_paiement, '')), ''),
    case when v_pro then trim(b.penalites_retard) end,
    case when v_pro then trim(b.indemnite_recouvrement) end,
    nullif(trim(coalesce(v_opt->>'notes', '')), ''), v_uid)
  returning id into v_id;

  insert into public.invoice_lines (invoice_id, farm_id, position, sale_id, sale_date, culture_id, label, unit,
    quantity, stems_per_unit, unit_price, line_total)
  select v_id, v_farm, l.ordre, l.sale_id, l.sale_date, l.culture_id, l.label, l.unit,
         l.quantity, l.stems_per_unit, l.unit_price, l.line_total
    from public._lignes_a_facturer(v_ids) l;

  insert into public.invoice_sales (invoice_id, farm_id, sale_id)
  select v_id, v_farm, x from unnest(v_ids) x;

  return v_id;
end; $$;

-- Avoir total : annule la facture et libère ses ventes.
create or replace function public.emettre_avoir(p_invoice_id uuid, p_motif text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  f public.invoices%rowtype;
  b public.farm_billing%rowtype;
  v_manque text[];
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
  v_manque := public._reglages_manquants(b, false);
  if cardinality(v_manque) > 0 then
    raise exception 'Mentions obligatoires manquantes : %', array_to_string(v_manque, ', ');
  end if;

  v_date := (clock_timestamp() at time zone 'Europe/Paris')::date;
  v_annee := extract(year from v_date)::int;
  v_seq := public.prochain_numero(f.farm_id, 'avoir', v_annee);
  v_numero := b.prefixe_avoir || v_annee::text || '-' || lpad(v_seq::text, 4, '0');

  insert into public.invoices (farm_id, season_id, client_id, kind, numero, annee, sequence, date_emission,
    date_vente_debut, date_vente_fin, date_echeance, vendeur, acheteur, total, mention_tva,
    conditions_paiement, notes, avoir_de, motif, created_by)
  values (f.farm_id, f.season_id, f.client_id, 'avoir', v_numero, v_annee, v_seq, v_date,
    f.date_vente_debut, f.date_vente_fin, null, public._vendeur(b), f.acheteur, -f.total, trim(b.mention_tva),
    null, null, f.id, trim(p_motif), v_uid)
  returning id into v_id;

  insert into public.invoice_lines (invoice_id, farm_id, position, sale_id, sale_date, culture_id, label, unit,
    quantity, stems_per_unit, unit_price, line_total)
  select v_id, f.farm_id, l.position, l.sale_id, l.sale_date, l.culture_id, l.label, l.unit,
         l.quantity, l.stems_per_unit, -l.unit_price, -l.line_total
    from public.invoice_lines l where l.invoice_id = f.id;

  update public.invoices set annulee_par = v_id where id = f.id;
  update public.invoice_sales set liberee_par_avoir = v_id where invoice_id = f.id and liberee_par_avoir is null;
  return v_id;
end; $$;

-- Paiement : simple insertion, contrôlée par paiement_controler().
-- p_paiement : {date (défaut : aujourd'hui à Paris), amount, mode, reference, notes, contrepasse_de}
create or replace function public.enregistrer_paiement(p_invoice_id uuid, p_paiement jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.payments (invoice_id, farm_id, date, amount, mode, reference, notes, contrepasse_de)
  values (p_invoice_id,
          -- recopiée de la facture par le trigger ; posée ici pour la policy
          (select farm_id from public.invoices where id = p_invoice_id),
          coalesce(nullif(p_paiement->>'date', '')::date, (now() at time zone 'Europe/Paris')::date),
          (p_paiement->>'amount')::numeric, coalesce(p_paiement->>'mode', 'autre'),
          nullif(trim(coalesce(p_paiement->>'reference', '')), ''), nullif(trim(coalesce(p_paiement->>'notes', '')), ''),
          nullif(p_paiement->>'contrepasse_de', '')::uuid)
  returning id into v_id;
  return v_id;
end; $$;

-- ------------------------------------------------------------
-- G. Vue de statut (calculée à la lecture, date de Paris)
-- ------------------------------------------------------------
create view public.invoices_status with (security_invoker = true) as
select i.id, i.farm_id, i.season_id, i.client_id, i.kind, i.numero, i.date_emission, i.date_echeance,
       i.total, i.acheteur->>'nom' as client_nom, i.avoir_de, i.annulee_par, l.numero as numero_lie,
       coalesce(p.paye, 0) as paye,
       -- reste dû ; négatif = trop-perçu à rembourser (facture annulée déjà payée)
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
            then (now() at time zone 'Europe/Paris')::date - i.date_echeance end as jours_de_retard
from public.invoices i
left join (select invoice_id, sum(amount) as paye from public.payments group by invoice_id) p on p.invoice_id = i.id
left join public.invoices l on l.id = coalesce(i.annulee_par, i.avoir_de);

-- ------------------------------------------------------------
-- H. RLS
-- ------------------------------------------------------------
alter table public.farm_billing     enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_lines    enable row level security;
alter table public.invoice_sales    enable row level security;
alter table public.payments         enable row level security;

create policy "facturation : lecture équipe" on public.farm_billing for select to authenticated
  using (farm_id in (select public.my_farm_ids()));
create policy "facturation : création owner" on public.farm_billing for insert to authenticated
  with check (public.is_farm_owner(farm_id));
create policy "facturation : modification owner" on public.farm_billing for update to authenticated
  using (public.is_farm_owner(farm_id)) with check (public.is_farm_owner(farm_id));

-- Écritures uniquement par emettre_facture / emettre_avoir (security definer) :
-- lecture seule pour l'équipe, aucune policy d'écriture.
create policy "compteurs : lecture équipe" on public.invoice_counters for select to authenticated
  using (farm_id in (select public.my_farm_ids()));
create policy "factures : lecture équipe" on public.invoices for select to authenticated
  using (farm_id in (select public.my_farm_ids()));
create policy "lignes de facture : lecture équipe" on public.invoice_lines for select to authenticated
  using (farm_id in (select public.my_farm_ids()));
create policy "ventes facturées : lecture équipe" on public.invoice_sales for select to authenticated
  using (farm_id in (select public.my_farm_ids()));

-- Paiements : lecture et ajout par l'équipe (farm_id recopié de la facture
-- par trigger ; my_farm_ids lit farm_members, que l'INSERT ne touche pas).
create policy "paiements : lecture équipe" on public.payments for select to authenticated
  using (farm_id in (select public.my_farm_ids()));
create policy "paiements : ajout équipe" on public.payments for insert to authenticated
  with check (farm_id in (select public.my_farm_ids()));

-- ------------------------------------------------------------
-- I. Droits
-- ------------------------------------------------------------
revoke all on public.farm_billing, public.invoice_counters, public.invoices, public.invoice_lines,
              public.invoice_sales, public.payments, public.invoices_status from anon;
revoke insert, update, delete, truncate on public.invoice_counters, public.invoices, public.invoice_lines,
              public.invoice_sales from authenticated;
revoke update, delete, truncate on public.payments from authenticated;
revoke delete, truncate on public.farm_billing from authenticated;
grant select on public.invoices_status to authenticated;

revoke execute on function
  public.prochain_numero(uuid, text, integer),
  public._reglages_manquants(public.farm_billing, boolean), public._vendeur(public.farm_billing),
  public._lignes_a_facturer(uuid[]),
  public.farm_billing_touch(), public.invoice_verifier_total(), public.factures_immuables(),
  public.factures_proteger_vente(), public.paiement_controler()
from public, anon, authenticated;
revoke execute on function
  public.emettre_facture(uuid[], jsonb), public.emettre_avoir(uuid, text), public.enregistrer_paiement(uuid, jsonb)
from public, anon;
grant execute on function
  public.emettre_facture(uuid[], jsonb), public.emettre_avoir(uuid, text), public.enregistrer_paiement(uuid, jsonb)
to authenticated;

-- ------------------------------------------------------------
-- Retour arrière (à exécuter à la main si besoin, AVANT toute facture
-- réelle : une facture émise doit être conservée) :
--   drop view public.invoices_status;
--   drop function public.enregistrer_paiement(uuid, jsonb);
--   drop function public.emettre_avoir(uuid, text);
--   drop function public.emettre_facture(uuid[], jsonb);
--   drop trigger trg_sales_facturees on public.sales;
--   drop trigger trg_sale_lines_facturees on public.sale_lines;
--   drop table public.payments;          -- triggers d'immuabilité : passer par
--   drop table public.invoice_sales;     -- DROP TABLE (pas DELETE ni TRUNCATE)
--   drop table public.invoice_lines;
--   drop table public.invoices;
--   drop table public.invoice_counters;
--   drop table public.farm_billing;
--   drop function public._lignes_a_facturer(uuid[]);
--   drop function public._vendeur(public.farm_billing);
--   drop function public._reglages_manquants(public.farm_billing, boolean);
--   drop function public.prochain_numero(uuid, text, integer);
--   drop function public.paiement_controler();
--   drop function public.factures_proteger_vente();
--   drop function public.factures_immuables();
--   drop function public.invoice_verifier_total();
--   drop function public.farm_billing_touch();
-- ------------------------------------------------------------
