-- ============================================================
-- 012 : gestion simple — justificatifs, comptes, relevés, rapprochement
-- ============================================================
-- But : une PRÉ-COMPTABILITÉ que l'agricultrice tient seule et transmet à
-- son comptable. Pas de partie double, pas de TVA (non assujettie), pas de
-- connexion bancaire : le relevé est importé en CSV.
--
-- Choix :
--  * receipts (justificatifs) : une pièce scannée ou importée, de une à
--    plusieurs pages (receipt_pages). Elle est « à traiter », puis rattachée
--    à une dépense (cost_id) OU à un paiement de facture (payment_id), ou
--    marquée « sans objet » (sans_objet_le). Ces trois issues s'excluent.
--    Les valeurs lues automatiquement (OCR) ne sont jamais enregistrées
--    seules : date_piece, montant et fournisseur sont ce que l'utilisatrice
--    a confirmé. Un justificatif rattaché ne se supprime plus ; un
--    justificatif à traiter (scanné par erreur) peut l'être ;
--  * fichiers : bucket Storage PRIVÉ `justificatifs`, chemin
--    `<farm_id>/<receipt_id>/<page>` (deux niveaux de dossier), affichage
--    par URL signée. Policies calquées sur 009 : premier dossier comparé
--    en TEXTE aux fermes de l'appelant (un nom qui ne serait pas un uuid ne
--    fait pas échouer un cast pour toute lecture du bucket) ;
--  * bank_accounts : comptes (banque, caisse) avec solde initial saisi.
--    Solde initial NULL = solde « non calculable » à l'écran, jamais 0 €.
--    Le mappage des colonnes du CSV est mémorisé par compte (csv_mapping) ;
--  * bank_imports : trace de chaque import (fichier, nombre de lignes,
--    nouvelles, doublons). Ni modifiée ni supprimée ;
--  * bank_transactions : mouvements importés (ou saisis pour une caisse).
--    IMMUABLES : aucune modification ni suppression, même avec la clé de
--    service (triggers). Dédoublonnage par l'empreinte
--    « date|centimes|libellé normalisé|rang » calculée par l'appli
--    (src/lib/domain/gestion.ts), unique par compte ; la base vérifie que
--    la date et le montant de l'empreinte sont ceux de la ligne ;
--  * bank_matches (rapprochements) : lien d'un mouvement vers une dépense,
--    un paiement de facture, une vente, ou une « opération hors facture »
--    (recette sans facture, apport, virement interne…). Plusieurs liens
--    par mouvement possibles (une remise de chèques couvre plusieurs
--    paiements), la somme des liens actifs ne dépasse pas le mouvement.
--    Une cible n'a qu'un lien actif. RIEN NE SE SUPPRIME : un rapprochement
--    erroné se DÉFAIT (annule_le posé une fois), la ligne reste. Une
--    dépense ou une vente rapprochée ne se supprime pas tant que le lien
--    est actif ; après « défaire », elle redevient supprimable et le lien
--    annulé perd sa cible (on delete set null, seule autre évolution permise) ;
--  * farm_id : recopié par trigger depuis le parent (compte, mouvement,
--    justificatif) ; sur les tables racines (receipts, bank_accounts) il
--    est fourni par l'appli et contrôlé par la policy. Toute référence
--    (dépense, paiement, vente, compte) est vérifiée dans la même ferme ;
--  * RLS : tout membre de la ferme lit et écrit (`my_farm_ids()`, qui lit
--    farm_members : aucune instruction de cette migration ne modifie
--    farm_members, donc pas de piège INSERT … RETURNING) ;
--  * écritures multi-tables atomiques par fonctions SECURITY INVOKER (les
--    policies et triggers s'appliquent) : importer_releve, creer_depense_liee ;
--  * montants en numeric(12,2) comme le reste du schéma ; l'appli calcule
--    en centimes.
-- Retour arrière : voir le bloc commenté en fin de fichier.
-- ============================================================

-- ------------------------------------------------------------
-- A. Justificatifs
-- ------------------------------------------------------------
create table public.receipts (
  id             uuid primary key default gen_random_uuid(),
  farm_id        uuid not null references public.farms(id) on delete restrict,
  date_piece     date,
  montant        numeric(12,2) check (montant is null or montant > 0),
  fournisseur    text check (fournisseur is null or length(fournisseur) <= 200),
  notes          text check (notes is null or length(notes) <= 2000),
  ocr_texte      text check (ocr_texte is null or length(ocr_texte) <= 20000),
  cost_id        uuid references public.costs(id) on delete set null,
  payment_id     uuid references public.payments(id) on delete restrict,
  sans_objet_le  timestamptz,
  created_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  check (num_nonnulls(cost_id, payment_id, sans_objet_le) <= 1)
);
create index receipts_farm_idx    on public.receipts(farm_id, created_at desc);
create index receipts_cost_idx    on public.receipts(cost_id) where cost_id is not null;
create index receipts_payment_idx on public.receipts(payment_id) where payment_id is not null;
comment on table public.receipts is
  'Justificatif : à traiter, rattaché à une dépense ou à un paiement, ou sans objet. Valeurs confirmées par l''utilisatrice (jamais l''OCR seul).';

create table public.receipt_pages (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.receipts(id) on delete cascade,
  farm_id     uuid not null references public.farms(id) on delete restrict,
  page        integer not null check (page between 1 and 50),
  path        text not null unique,
  mime        text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  taille      integer check (taille is null or taille > 0),
  nom_origine text check (nom_origine is null or length(nom_origine) <= 255),
  width       integer check (width is null or width > 0),
  height      integer check (height is null or height > 0),
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (receipt_id, page)
);
create index receipt_pages_farm_idx on public.receipt_pages(farm_id);

-- ------------------------------------------------------------
-- B. Comptes, imports, mouvements
-- ------------------------------------------------------------
create table public.bank_accounts (
  id                 uuid primary key default gen_random_uuid(),
  farm_id            uuid not null references public.farms(id) on delete restrict,
  name               text not null check (length(btrim(name)) between 1 and 80),
  kind               text not null default 'banque' check (kind in ('banque', 'caisse')),
  solde_initial      numeric(12,2),
  date_solde_initial date,
  csv_mapping        jsonb,
  archived_at        timestamptz,
  created_by         uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  check (date_solde_initial is null or solde_initial is not null)
);
create index bank_accounts_farm_idx on public.bank_accounts(farm_id);
comment on column public.bank_accounts.solde_initial is
  'Solde au début du jour date_solde_initial (ou avant tout mouvement si la date est vide). NULL = solde non calculable.';

create table public.bank_imports (
  id            uuid primary key default gen_random_uuid(),
  farm_id       uuid not null references public.farms(id) on delete restrict,
  account_id    uuid not null references public.bank_accounts(id) on delete restrict,
  fichier       text not null check (length(fichier) between 1 and 255),
  nb_lignes     integer not null check (nb_lignes >= 0),
  nb_nouvelles  integer not null check (nb_nouvelles >= 0),
  nb_doublons   integer not null check (nb_doublons >= 0),
  date_min      date,
  date_max      date,
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (nb_nouvelles + nb_doublons = nb_lignes)
);
create index bank_imports_account_idx on public.bank_imports(account_id, created_at desc);

create table public.bank_transactions (
  id          uuid primary key default gen_random_uuid(),
  farm_id     uuid not null references public.farms(id) on delete restrict,
  account_id  uuid not null references public.bank_accounts(id) on delete restrict,
  import_id   uuid references public.bank_imports(id) on delete restrict,
  date        date not null,
  label       text not null check (length(label) between 1 and 500),
  amount      numeric(12,2) not null check (amount <> 0),
  empreinte   text not null,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (account_id, empreinte),
  -- l'empreinte commence par la date et le montant en centimes de la ligne
  check (split_part(empreinte, '|', 1) = date::text
         and split_part(empreinte, '|', 2) = ((amount * 100)::bigint)::text)
);
create index bank_transactions_account_date_idx on public.bank_transactions(account_id, date);
create index bank_transactions_farm_date_idx on public.bank_transactions(farm_id, date);
comment on column public.bank_transactions.empreinte is
  'date|centimes|libellé normalisé|rang (rang des lignes identiques dans le fichier). Unique par compte : dédoublonnage à la réimportation.';

-- ------------------------------------------------------------
-- C. Rapprochements
-- ------------------------------------------------------------
create table public.bank_matches (
  id              uuid primary key default gen_random_uuid(),
  farm_id         uuid not null references public.farms(id) on delete restrict,
  transaction_id  uuid not null references public.bank_transactions(id) on delete restrict,
  kind            text not null check (kind in ('depense', 'paiement', 'vente', 'hors_facture')),
  cost_id         uuid references public.costs(id) on delete set null,
  payment_id      uuid references public.payments(id) on delete restrict,
  sale_id         uuid references public.sales(id) on delete set null,
  categorie       text check (categorie in ('vente_hors_facture', 'subvention_aide', 'remboursement',
                                            'apport_personnel', 'prelevement_personnel', 'virement_interne',
                                            'emprunt', 'autre')),
  libelle         text check (libelle is null or length(libelle) <= 200),
  amount          numeric(12,2) not null check (amount <> 0),
  annule_le       timestamptz,
  annule_par      uuid references public.profiles(id) on delete set null,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- Une cible conforme au type ; un lien annulé peut avoir perdu la sienne
  -- (dépense ou vente supprimée après « défaire »).
  check (
    (kind = 'depense'      and payment_id is null and sale_id is null and categorie is null and (cost_id is not null or annule_le is not null))
    or (kind = 'paiement'  and cost_id is null and sale_id is null and categorie is null and payment_id is not null)
    or (kind = 'vente'     and cost_id is null and payment_id is null and categorie is null and (sale_id is not null or annule_le is not null))
    or (kind = 'hors_facture' and cost_id is null and payment_id is null and sale_id is null and categorie is not null)
  ),
  check (annule_par is null or annule_le is not null)
);
create index bank_matches_transaction_idx on public.bank_matches(transaction_id);
create index bank_matches_farm_idx on public.bank_matches(farm_id);
-- Une cible n'a qu'un rapprochement actif
create unique index bank_matches_cost_actif_uidx    on public.bank_matches(cost_id)    where annule_le is null and cost_id is not null;
create unique index bank_matches_payment_actif_uidx on public.bank_matches(payment_id) where annule_le is null and payment_id is not null;
create unique index bank_matches_sale_actif_uidx    on public.bank_matches(sale_id)    where annule_le is null and sale_id is not null;
comment on column public.bank_matches.amount is
  'Part du mouvement couverte par ce lien, de même signe que le mouvement. Somme des liens actifs ≤ montant du mouvement.';

-- ------------------------------------------------------------
-- D. Cohérence : farm_id recopié, références de la ferme
-- ------------------------------------------------------------
create or replace function public.gestion_set_farm()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_farm uuid; v_montant numeric; v_tx record; v_somme numeric;
begin
  if tg_table_name = 'receipts' then
    if tg_op = 'UPDATE' then
      if new.farm_id is distinct from old.farm_id then raise exception 'Un justificatif ne change pas de ferme'; end if;
      new.updated_at := now();
    end if;
    if new.cost_id is not null and not exists (select 1 from public.costs c where c.id = new.cost_id and c.farm_id = new.farm_id) then
      raise exception 'Dépense % hors de la ferme', new.cost_id;
    end if;
    if new.payment_id is not null and not exists (select 1 from public.payments p where p.id = new.payment_id and p.farm_id = new.farm_id) then
      raise exception 'Paiement % hors de la ferme', new.payment_id;
    end if;
    return new;
  end if;

  if tg_table_name = 'receipt_pages' then
    select r.farm_id into v_farm from public.receipts r where r.id = new.receipt_id;
    if v_farm is null then raise exception 'Justificatif % introuvable', new.receipt_id; end if;
    new.farm_id := v_farm;
    if tg_op = 'UPDATE' and (new.path is distinct from old.path or new.receipt_id is distinct from old.receipt_id) then
      raise exception 'Une page de justificatif ne change ni de fichier ni de justificatif';
    end if;
    if new.path not like v_farm::text || '/' || new.receipt_id::text || '/%' or position('..' in new.path) > 0
       or array_length(string_to_array(new.path, '/'), 1) <> 3 then
      raise exception 'Chemin de justificatif invalide : %', new.path;
    end if;
    return new;
  end if;

  if tg_table_name = 'bank_accounts' then
    if tg_op = 'UPDATE' and new.farm_id is distinct from old.farm_id then
      raise exception 'Un compte ne change pas de ferme';
    end if;
    return new;
  end if;

  if tg_table_name = 'bank_imports' or tg_table_name = 'bank_transactions' then
    select a.farm_id into v_farm from public.bank_accounts a where a.id = new.account_id;
    if v_farm is null then raise exception 'Compte % introuvable', new.account_id; end if;
    new.farm_id := v_farm;
    -- PL/pgSQL n'évalue pas en court-circuit : new.import_id n'existe pas
    -- sur bank_imports, d'où les if imbriqués.
    if tg_table_name = 'bank_transactions' then
      if new.import_id is not null
         and not exists (select 1 from public.bank_imports i where i.id = new.import_id and i.account_id = new.account_id) then
        raise exception 'Import % d''un autre compte', new.import_id;
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'bank_matches' then
    -- Verrou du mouvement : deux rapprochements simultanés ne dépassent pas son montant
    select t.id, t.farm_id, t.amount into v_tx from public.bank_transactions t where t.id = new.transaction_id for update;
    if v_tx.id is null then raise exception 'Mouvement % introuvable', new.transaction_id; end if;
    new.farm_id := v_tx.farm_id;
    new.annule_le := null; new.annule_par := null;
    if sign(new.amount) <> sign(v_tx.amount) then
      raise exception 'Le rapprochement doit être de même sens que le mouvement';
    end if;
    select coalesce(sum(abs(m.amount)), 0) into v_somme from public.bank_matches m
      where m.transaction_id = new.transaction_id and m.annule_le is null;
    if v_somme + abs(new.amount) > abs(v_tx.amount) then
      raise exception 'Rapprochement supérieur au reste du mouvement (reste % €)', abs(v_tx.amount) - v_somme;
    end if;

    if new.kind = 'depense' then
      select c.amount into v_montant from public.costs c where c.id = new.cost_id and c.farm_id = v_tx.farm_id;
      if v_montant is null then raise exception 'Dépense % hors de la ferme', new.cost_id; end if;
      if v_tx.amount > 0 then raise exception 'Une dépense se rapproche d''un débit'; end if;
    elsif new.kind = 'paiement' then
      select p.amount into v_montant from public.payments p where p.id = new.payment_id and p.farm_id = v_tx.farm_id;
      if v_montant is null then raise exception 'Paiement % hors de la ferme', new.payment_id; end if;
      if sign(v_montant) <> sign(v_tx.amount) then raise exception 'Paiement et mouvement de sens contraires'; end if;
    elsif new.kind = 'vente' then
      select s.total into v_montant from public.sales s join public.seasons se on se.id = s.season_id
        where s.id = new.sale_id and se.farm_id = v_tx.farm_id;
      if v_montant is null then raise exception 'Vente % hors de la ferme', new.sale_id; end if;
      if v_tx.amount < 0 then raise exception 'Une vente se rapproche d''un crédit'; end if;
    end if;
    if v_montant is not null and abs(new.amount) > abs(v_montant) then
      raise exception 'Rapprochement (% €) supérieur au montant de la pièce (% €)', abs(new.amount), abs(v_montant);
    end if;
    return new;
  end if;

  raise exception 'gestion_set_farm : table % inattendue', tg_table_name;
end; $$;

create trigger trg_receipts_set_farm before insert or update on public.receipts
  for each row execute function public.gestion_set_farm();
create trigger trg_receipt_pages_set_farm before insert or update on public.receipt_pages
  for each row execute function public.gestion_set_farm();
create trigger trg_bank_accounts_set_farm before insert or update on public.bank_accounts
  for each row execute function public.gestion_set_farm();
create trigger trg_bank_imports_set_farm before insert on public.bank_imports
  for each row execute function public.gestion_set_farm();
create trigger trg_bank_transactions_set_farm before insert on public.bank_transactions
  for each row execute function public.gestion_set_farm();
create trigger trg_bank_matches_set_farm before insert on public.bank_matches
  for each row execute function public.gestion_set_farm();

-- ------------------------------------------------------------
-- E. Rien ne se supprime dans le flux financier
-- ------------------------------------------------------------
create or replace function public.gestion_immuable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Table % : rien ne se supprime dans le flux financier', tg_table_name;
  end if;

  if tg_table_name = 'bank_matches' then
    if tg_op = 'DELETE' then
      raise exception 'Un rapprochement ne se supprime pas : le défaire';
    end if;
    -- Défaire : annule_le posé une fois, rien d'autre
    if old.annule_le is null and new.annule_le is not null
       and (to_jsonb(new) - 'annule_le' - 'annule_par') = (to_jsonb(old) - 'annule_le' - 'annule_par') then
      new.annule_par := auth.uid();
      return new;
    end if;
    -- Lien déjà défait dont la dépense ou la vente est supprimée (on delete set null)
    if old.annule_le is not null
       and ((old.cost_id is not null and new.cost_id is null and (to_jsonb(new) - 'cost_id') = (to_jsonb(old) - 'cost_id'))
            or (old.sale_id is not null and new.sale_id is null and (to_jsonb(new) - 'sale_id') = (to_jsonb(old) - 'sale_id'))) then
      return new;
    end if;
    raise exception 'Rapprochement figé : il ne peut qu''être défait';
  end if;

  if tg_table_name = 'receipts' then
    -- DELETE : un justificatif rattaché ne se supprime pas
    if old.cost_id is not null or old.payment_id is not null then
      raise exception 'Justificatif rattaché : le détacher avant de le supprimer';
    end if;
    return old;
  end if;

  if tg_table_name = 'costs' or tg_table_name = 'sales' then
    -- DELETE d'une dépense ou d'une vente rapprochée d'un mouvement
    if exists (select 1 from public.bank_matches m
               where m.annule_le is null and (m.cost_id = old.id or m.sale_id = old.id)) then
      raise exception '% rapprochée d''un mouvement bancaire : défaire le rapprochement d''abord',
        case tg_table_name when 'costs' then 'Dépense' else 'Vente' end;
    end if;
    return old;
  end if;

  -- bank_imports, bank_transactions : ni modification ni suppression
  raise exception 'Table % : un mouvement importé ne se modifie ni ne se supprime', tg_table_name;
end; $$;

create trigger trg_bank_imports_immuables before update or delete on public.bank_imports
  for each row execute function public.gestion_immuable();
create trigger trg_bank_transactions_immuables before update or delete on public.bank_transactions
  for each row execute function public.gestion_immuable();
create trigger trg_bank_matches_immuables before update or delete on public.bank_matches
  for each row execute function public.gestion_immuable();
create trigger trg_bank_imports_no_truncate before truncate on public.bank_imports
  for each statement execute function public.gestion_immuable();
create trigger trg_bank_transactions_no_truncate before truncate on public.bank_transactions
  for each statement execute function public.gestion_immuable();
create trigger trg_bank_matches_no_truncate before truncate on public.bank_matches
  for each statement execute function public.gestion_immuable();
create trigger trg_receipts_suppression before delete on public.receipts
  for each row execute function public.gestion_immuable();
create trigger trg_costs_rapprochees before delete on public.costs
  for each row execute function public.gestion_immuable();
create trigger trg_sales_rapprochees before delete on public.sales
  for each row execute function public.gestion_immuable();

-- ------------------------------------------------------------
-- F. Écritures atomiques (SECURITY INVOKER : policies et triggers s'appliquent)
-- ------------------------------------------------------------
-- Import d'un relevé. p_lignes : [{date, label, amount, empreinte}], empreintes
-- calculées par l'appli (gestion.ts). Les lignes déjà connues du compte sont
-- ignorées (doublons). Mémorise le mappage du compte. Renvoie
-- {import_id, nouvelles, doublons}.
create or replace function public.importer_releve(p_account_id uuid, p_fichier text, p_mappage jsonb, p_lignes jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare v_import uuid; v_n int; v_nouv int; v_min date; v_max date;
begin
  if not exists (select 1 from public.bank_accounts where id = p_account_id) then
    raise exception 'Compte % introuvable ou inaccessible', p_account_id;
  end if;
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Relevé vide';
  end if;
  if jsonb_array_length(p_lignes) > 5000 then
    raise exception 'Relevé trop long (% lignes, 5000 au plus) : découper le fichier', jsonb_array_length(p_lignes);
  end if;

  -- Lignes du fichier (aucune table temporaire : pas de droit TEMP requis)
  if exists (select 1 from jsonb_to_recordset(p_lignes) as r(empreinte text)
             group by r.empreinte having count(*) > 1) then
    raise exception 'Empreintes en double dans le fichier : rangs mal calculés';
  end if;

  select count(*), min(r.date), max(r.date),
         count(*) filter (where not exists (select 1 from public.bank_transactions t
                                            where t.account_id = p_account_id and t.empreinte = r.empreinte))
    into v_n, v_min, v_max, v_nouv
    from jsonb_to_recordset(p_lignes) as r(date date, empreinte text);

  insert into public.bank_imports (account_id, farm_id, fichier, nb_lignes, nb_nouvelles, nb_doublons, date_min, date_max)
  values (p_account_id, (select farm_id from public.bank_accounts where id = p_account_id),
          left(coalesce(nullif(btrim(p_fichier), ''), 'relevé.csv'), 255), v_n, v_nouv, v_n - v_nouv, v_min, v_max)
  returning id into v_import;

  insert into public.bank_transactions (account_id, farm_id, import_id, date, label, amount, empreinte)
  select p_account_id, (select farm_id from public.bank_accounts where id = p_account_id), v_import,
         r.date, btrim(r.label), r.amount, r.empreinte
  from jsonb_to_recordset(p_lignes) as r(date date, label text, amount numeric(12,2), empreinte text)
  on conflict (account_id, empreinte) do nothing;

  if p_mappage is not null then
    update public.bank_accounts set csv_mapping = p_mappage where id = p_account_id;
  end if;
  return jsonb_build_object('import_id', v_import, 'nouvelles', v_nouv, 'doublons', v_n - v_nouv);
end; $$;

-- Crée une dépense (costs, 008), et dans la même transaction la rattache à un
-- justificatif et/ou la rapproche d'un mouvement.
-- p_cost : {season_id, date, category, amount, supplier, notes, culture_id, planche_id}
create or replace function public.creer_depense_liee(p_cost jsonb, p_receipt_id uuid default null, p_transaction_id uuid default null)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid; v_amount numeric; v_tx numeric;
begin
  v_amount := (p_cost->>'amount')::numeric;
  insert into public.costs (farm_id, season_id, date, category, amount, culture_id, planche_id, supplier, notes)
  values ((select farm_id from public.seasons where id = (p_cost->>'season_id')::uuid),
          (p_cost->>'season_id')::uuid, (p_cost->>'date')::date, p_cost->>'category', v_amount,
          nullif(p_cost->>'culture_id', '')::uuid, nullif(p_cost->>'planche_id', '')::uuid,
          nullif(btrim(coalesce(p_cost->>'supplier', '')), ''), nullif(btrim(coalesce(p_cost->>'notes', '')), ''))
  returning id into v_id;

  if p_receipt_id is not null then
    update public.receipts set cost_id = v_id, sans_objet_le = null
      where id = p_receipt_id and payment_id is null;
    if not found then raise exception 'Justificatif % introuvable ou déjà rattaché à un paiement', p_receipt_id; end if;
  end if;

  if p_transaction_id is not null then
    select amount into v_tx from public.bank_transactions where id = p_transaction_id;
    if v_tx is null then raise exception 'Mouvement % introuvable', p_transaction_id; end if;
    insert into public.bank_matches (transaction_id, farm_id, kind, cost_id, amount)
    values (p_transaction_id, (select farm_id from public.bank_transactions where id = p_transaction_id),
            'depense', v_id, -least(v_amount, abs(v_tx)));
  end if;
  return v_id;
end; $$;

-- ------------------------------------------------------------
-- G. RLS
-- ------------------------------------------------------------
alter table public.receipts          enable row level security;
alter table public.receipt_pages     enable row level security;
alter table public.bank_accounts     enable row level security;
alter table public.bank_imports      enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_matches      enable row level security;

create policy "justificatifs : membres" on public.receipts for all to authenticated
  using (farm_id in (select public.my_farm_ids()))
  with check (farm_id in (select public.my_farm_ids()));
create policy "pages de justificatif : membres" on public.receipt_pages for all to authenticated
  using (farm_id in (select public.my_farm_ids()))
  with check (farm_id in (select public.my_farm_ids()));
create policy "comptes : membres" on public.bank_accounts for all to authenticated
  using (farm_id in (select public.my_farm_ids()))
  with check (farm_id in (select public.my_farm_ids()));
-- Imports, mouvements, rapprochements : lecture et ajout ; la seule
-- modification permise (défaire un rapprochement) est contrôlée par trigger.
create policy "imports : lecture" on public.bank_imports for select to authenticated
  using (farm_id in (select public.my_farm_ids()));
create policy "imports : ajout" on public.bank_imports for insert to authenticated
  with check (farm_id in (select public.my_farm_ids()));
create policy "mouvements : lecture" on public.bank_transactions for select to authenticated
  using (farm_id in (select public.my_farm_ids()));
create policy "mouvements : ajout" on public.bank_transactions for insert to authenticated
  with check (farm_id in (select public.my_farm_ids()));
create policy "rapprochements : lecture" on public.bank_matches for select to authenticated
  using (farm_id in (select public.my_farm_ids()));
create policy "rapprochements : ajout" on public.bank_matches for insert to authenticated
  with check (farm_id in (select public.my_farm_ids()));
create policy "rapprochements : défaire" on public.bank_matches for update to authenticated
  using (farm_id in (select public.my_farm_ids()))
  with check (farm_id in (select public.my_farm_ids()));

-- ------------------------------------------------------------
-- H. Storage : bucket privé `justificatifs`
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('justificatifs', 'justificatifs', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "justificatifs : lecture des fichiers de ma ferme" on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs'
         and (storage.foldername(name))[1] in (select f::text from public.my_farm_ids() f));
create policy "justificatifs : ajout de fichiers dans ma ferme" on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs'
              and (storage.foldername(name))[1] in (select f::text from public.my_farm_ids() f)
              and array_length(storage.foldername(name), 1) = 2);
create policy "justificatifs : suppression des fichiers de ma ferme" on storage.objects for delete to authenticated
  using (bucket_id = 'justificatifs'
         and (storage.foldername(name))[1] in (select f::text from public.my_farm_ids() f));

-- ------------------------------------------------------------
-- I. Droits
-- ------------------------------------------------------------
revoke all on public.receipts, public.receipt_pages, public.bank_accounts, public.bank_imports,
              public.bank_transactions, public.bank_matches from anon;
revoke update, delete, truncate on public.bank_imports, public.bank_transactions from authenticated;
revoke delete, truncate on public.bank_matches from authenticated;
revoke truncate on public.receipts, public.receipt_pages, public.bank_accounts from authenticated;

revoke execute on function public.gestion_set_farm(), public.gestion_immuable() from public, anon, authenticated;
revoke execute on function
  public.importer_releve(uuid, text, jsonb, jsonb), public.creer_depense_liee(jsonb, uuid, uuid)
from public, anon;
grant execute on function
  public.importer_releve(uuid, text, jsonb, jsonb), public.creer_depense_liee(jsonb, uuid, uuid)
to authenticated;

-- ------------------------------------------------------------
-- Retour arrière (à exécuter à la main si besoin, AVANT toute donnée
-- réelle). Les fichiers du bucket se suppriment par l'API Storage (ou le
-- tableau de bord), pas en SQL : vider le bucket `justificatifs` d'abord.
--   drop policy "justificatifs : lecture des fichiers de ma ferme" on storage.objects;
--   drop policy "justificatifs : ajout de fichiers dans ma ferme" on storage.objects;
--   drop policy "justificatifs : suppression des fichiers de ma ferme" on storage.objects;
--   delete from storage.buckets where id = 'justificatifs';   -- refusé si le bucket n'est pas vide
--   drop trigger trg_costs_rapprochees on public.costs;
--   drop trigger trg_sales_rapprochees on public.sales;
--   drop function public.creer_depense_liee(jsonb, uuid, uuid);
--   drop function public.importer_releve(uuid, text, jsonb, jsonb);
--   drop table public.bank_matches;        -- triggers d'immuabilité : passer par
--   drop table public.bank_transactions;   -- DROP TABLE (pas DELETE ni TRUNCATE)
--   drop table public.bank_imports;
--   drop table public.bank_accounts;
--   drop table public.receipt_pages;
--   drop table public.receipts;
--   drop function public.gestion_immuable();
--   drop function public.gestion_set_farm();
-- ------------------------------------------------------------
