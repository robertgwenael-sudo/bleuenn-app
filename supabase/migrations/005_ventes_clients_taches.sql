-- ============================================================
-- 005 : clients, ventes et commandes en lignes, pertes, tâches
-- ============================================================
-- Additif et rétrocompatible : l'appli actuelle continue de lire et
-- d'écrire `sales` comme avant. Quand une vente a des lignes, ses
-- colonnes total / tiges / prix_unitaire / cultures_sold sont recalculées
-- à partir des lignes, ce qui garde les écrans existants justes.
-- Montants en numeric(…, 2), comme le reste du schéma.
-- ============================================================

-- ------------------------------------------------------------
-- Clients : partagés dans l'équipe (comme le catalogue), hors saison
-- ------------------------------------------------------------
create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id),
  name         text not null check (length(trim(name)) > 0),
  kind         text not null default 'particulier'
               check (kind in ('fleuriste','particulier','mariage','abonne','evenementiel','commerce','autre')),
  contact_name text,
  email        text,
  phone        text,
  address      text,
  notes        text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index clients_user_idx on public.clients(user_id);

-- ------------------------------------------------------------
-- Commandes clients (fleuristes, mariages, abonnements…)
-- ------------------------------------------------------------
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.seasons(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete set null,
  delivery_date date not null,
  status        text not null default 'confirmee'
                check (status in ('devis','confirmee','prete','livree','annulee')),
  channel       text,
  notes         text,
  sale_id       uuid references public.sales(id) on delete set null,
  created_by    uuid default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index orders_season_idx on public.orders(season_id, delivery_date);

-- Ventes : `total` était une colonne générée (tiges * prix_unitaire). Une
-- vente détaillée en lignes (bottes à 6,50 €, tiges à 0,80 €…) n'a pas de
-- prix unitaire unique qui retombe pile sur la somme des lignes : total
-- devient une colonne normale, tenue par trigger (voir sales_set_total).
alter table public.sales alter column total drop expression;

-- Ventes : rattachement au client et à la commande d'origine
alter table public.sales add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.sales add column if not exists order_id  uuid references public.orders(id)  on delete set null;
create index if not exists sales_season_idx on public.sales(season_id, date);

-- ------------------------------------------------------------
-- Lignes de vente et de commande
-- season_id est recopié du parent par trigger : la RLS reste un simple
-- test d'appartenance à la saison, sans relire la table parente.
-- ------------------------------------------------------------
create table public.sale_lines (
  id             uuid primary key default gen_random_uuid(),
  sale_id        uuid not null references public.sales(id) on delete cascade,
  season_id      uuid not null references public.seasons(id) on delete cascade,
  culture_id     uuid references public.culture_catalog(id) on delete set null,
  label          text not null check (length(trim(label)) > 0),
  unit           text not null default 'tige' check (unit in ('tige','botte','bouquet','seau','autre')),
  quantity       numeric(10,2) not null check (quantity > 0),
  stems_per_unit integer not null default 1 check (stems_per_unit > 0),
  unit_price     numeric(10,2) not null check (unit_price >= 0),
  line_total     numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at     timestamptz not null default now()
);
create index sale_lines_sale_idx on public.sale_lines(sale_id);
create index sale_lines_season_idx on public.sale_lines(season_id);

create table public.order_lines (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  season_id      uuid not null references public.seasons(id) on delete cascade,
  culture_id     uuid references public.culture_catalog(id) on delete set null,
  label          text not null check (length(trim(label)) > 0),
  unit           text not null default 'tige' check (unit in ('tige','botte','bouquet','seau','autre')),
  quantity       numeric(10,2) not null check (quantity > 0),
  stems_per_unit integer not null default 1 check (stems_per_unit > 0),
  unit_price     numeric(10,2) not null check (unit_price >= 0),
  line_total     numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at     timestamptz not null default now()
);
create index order_lines_order_idx on public.order_lines(order_id);
create index order_lines_season_idx on public.order_lines(season_id);

create or replace function public.sale_line_set_season()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select s.season_id into new.season_id from public.sales s where s.id = new.sale_id;
  if new.season_id is null then raise exception 'Vente % introuvable', new.sale_id; end if;
  return new;
end; $$;

create or replace function public.order_line_set_season()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select o.season_id into new.season_id from public.orders o where o.id = new.order_id;
  if new.season_id is null then raise exception 'Commande % introuvable', new.order_id; end if;
  return new;
end; $$;

create trigger trg_sale_line_season before insert or update of sale_id on public.sale_lines
  for each row execute function public.sale_line_set_season();
create trigger trg_order_line_season before insert or update of order_id on public.order_lines
  for each row execute function public.order_line_set_season();

-- Vente sans lignes : comportement historique, total = tiges × prix, arrondi
-- au centime. Vente avec lignes : total imposé par sale_recompute().
create or replace function public.sales_set_total()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.sale_lines where sale_id = new.id) then
    new.total := round(coalesce(new.tiges, 0)::numeric * coalesce(new.prix_unitaire, 0), 2);
  end if;
  return new;
end; $$;

create trigger trg_sales_set_total before insert or update on public.sales
  for each row execute function public.sales_set_total();

-- Recalcul des colonnes agrégées de la vente à partir de ses lignes
create or replace function public.sale_recompute()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sale uuid := coalesce(new.sale_id, old.sale_id);
begin
  update public.sales s set
    total         = agg.total,
    tiges         = agg.tiges,
    prix_unitaire = case when agg.tiges > 0 then round(agg.total / agg.tiges, 4) else 0 end,
    cultures_sold = agg.labels
  from (
    select coalesce(sum(line_total), 0) as total,
           coalesce(sum(quantity * stems_per_unit), 0)::int as tiges,
           string_agg(distinct label, ', ') as labels
    from public.sale_lines where sale_id = v_sale
  ) agg
  where s.id = v_sale
    and exists (select 1 from public.sale_lines where sale_id = v_sale);
  return null;
end; $$;

create trigger trg_sale_recompute after insert or update or delete on public.sale_lines
  for each row execute function public.sale_recompute();

-- ------------------------------------------------------------
-- Pertes (invendus, fleurs abîmées, météo…)
-- ------------------------------------------------------------
create table public.losses (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.seasons(id) on delete cascade,
  planting_id uuid references public.plantings(id) on delete set null,
  culture_id  uuid references public.culture_catalog(id) on delete set null,
  date        date not null,
  tiges       integer not null check (tiges > 0),
  reason      text not null default 'autre'
              check (reason in ('invendu','abime','meteo','ravageur','maladie','autre')),
  notes       text,
  created_at  timestamptz not null default now()
);
create index losses_season_idx on public.losses(season_id, date);
create index losses_planting_idx on public.losses(planting_id);

create index if not exists harvests_planting_idx on public.harvests(planting_id);

-- ------------------------------------------------------------
-- Tâches. Les tâches tirées du plan de culture (semer, planter,
-- récolter) sont calculées par l'appli ; on ne stocke une ligne que
-- lorsqu'on les coche ou les assigne, repérée par auto_key
-- (ex. 'semis:<planting_id>'). Les tâches libres n'ont pas d'auto_key.
-- ------------------------------------------------------------
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.seasons(id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  kind        text not null default 'autre'
              check (kind in ('semis','repiquage','plantation','pincage','tuteurage','desherbage',
                              'recolte','irrigation','traitement','livraison','autre')),
  due_date    date,
  planting_id uuid references public.plantings(id) on delete cascade,
  planche_id  uuid references public.planches(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  auto_key    text,
  done_at     timestamptz,
  done_by     uuid references public.profiles(id) on delete set null,
  notes       text,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (season_id, auto_key)
);
create index tasks_season_due_idx on public.tasks(season_id, due_date);

-- ------------------------------------------------------------
-- Réel par plantation : récoltes et pertes cumulées
-- ------------------------------------------------------------
create view public.planting_actuals with (security_invoker = true) as
select p.id as planting_id,
       p.season_id,
       coalesce(h.tiges, 0)  as tiges_recoltees,
       coalesce(l.tiges, 0)  as tiges_perdues,
       h.nb                  as nb_recoltes,
       h.premiere            as premiere_recolte,
       h.derniere            as derniere_recolte
from public.plantings p
left join (
  select planting_id, sum(tiges)::int as tiges, count(*)::int as nb, min(date) as premiere, max(date) as derniere
  from public.harvests group by planting_id
) h on h.planting_id = p.id
left join (
  select planting_id, sum(tiges)::int as tiges from public.losses
  where planting_id is not null group by planting_id
) l on l.planting_id = p.id;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.clients     enable row level security;
alter table public.orders      enable row level security;
alter table public.sale_lines  enable row level security;
alter table public.order_lines enable row level security;
alter table public.losses      enable row level security;
alter table public.tasks       enable row level security;

create policy "clients : lecture équipe" on public.clients
  for select to authenticated using (user_id in (select public.my_teammate_ids()));
create policy "clients : création" on public.clients
  for insert to authenticated with check (user_id = auth.uid());
create policy "clients : modification équipe" on public.clients
  for update to authenticated
  using (user_id in (select public.my_teammate_ids()))
  with check (user_id in (select public.my_teammate_ids()));
create policy "clients : suppression équipe" on public.clients
  for delete to authenticated using (user_id in (select public.my_teammate_ids()));

create policy "commandes : membres" on public.orders for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));
create policy "lignes de vente : membres" on public.sale_lines for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));
create policy "lignes de commande : membres" on public.order_lines for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));
create policy "pertes : membres" on public.losses for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));
create policy "tâches : membres" on public.tasks for all to authenticated
  using (season_id in (select public.my_season_ids()))
  with check (season_id in (select public.my_season_ids()));

revoke all on public.clients, public.orders, public.sale_lines, public.order_lines,
              public.losses, public.tasks, public.planting_actuals from anon;
grant select on public.planting_actuals to authenticated;

revoke execute on function public.sale_line_set_season(), public.order_line_set_season(),
  public.sale_recompute(), public.sales_set_total() from public, anon, authenticated;
