-- ============================================================
-- 007 : écritures commerciales atomiques
-- ============================================================
-- Créer une vente ou une commande avec ses lignes, et « livrer et facturer »
-- enchaînaient plusieurs requêtes depuis le navigateur, avec une suppression
-- de secours en cas d'échec : une coupure réseau au mauvais moment pouvait
-- laisser une vente sans lignes ou une commande facturée deux fois.
-- Chaque opération devient une fonction : tout passe ou rien ne passe.
--
-- SECURITY INVOKER (par défaut) : la fonction s'exécute avec les droits de
-- l'appelant, la RLS s'applique exactement comme pour des requêtes directes.
-- Les lignes arrivent en JSON : [{culture_id, label, unit, quantity,
-- stems_per_unit, unit_price}, …]. season_id et line_total sont posés par
-- la base (triggers 005, colonne générée).
-- ============================================================

create or replace function public._inserer_lignes_vente(p_sale_id uuid, p_lines jsonb)
returns void language sql set search_path = '' as $$
  insert into public.sale_lines (sale_id, culture_id, label, unit, quantity, stems_per_unit, unit_price)
  select p_sale_id, l.culture_id, l.label, coalesce(l.unit, 'tige'), l.quantity, coalesce(l.stems_per_unit, 1), l.unit_price
  from jsonb_to_recordset(p_lines)
    as l(culture_id uuid, label text, unit text, quantity numeric, stems_per_unit int, unit_price numeric);
$$;

create or replace function public._inserer_lignes_commande(p_order_id uuid, p_lines jsonb)
returns void language sql set search_path = '' as $$
  insert into public.order_lines (order_id, culture_id, label, unit, quantity, stems_per_unit, unit_price)
  select p_order_id, l.culture_id, l.label, coalesce(l.unit, 'tige'), l.quantity, coalesce(l.stems_per_unit, 1), l.unit_price
  from jsonb_to_recordset(p_lines)
    as l(culture_id uuid, label text, unit text, quantity numeric, stems_per_unit int, unit_price numeric);
$$;

-- Vente multi-lignes. p_sale : {season_id, date, channel, client_id, client, notes, order_id}
create or replace function public.enregistrer_vente(p_sale jsonb, p_lines jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Une vente doit avoir au moins une ligne';
  end if;
  insert into public.sales (season_id, user_id, date, channel, client_id, client, notes, order_id, tiges, prix_unitaire)
  values ((p_sale->>'season_id')::uuid, auth.uid(), (p_sale->>'date')::date, p_sale->>'channel',
          nullif(p_sale->>'client_id', '')::uuid, p_sale->>'client', p_sale->>'notes',
          nullif(p_sale->>'order_id', '')::uuid, 0, 0)
  returning id into v_id;
  perform public._inserer_lignes_vente(v_id, p_lines);
  return v_id;
end; $$;

-- Commande : création (p_order_id null) ou remplacement complet de l'en-tête et des lignes.
-- p_order : {season_id, client_id, delivery_date, status, channel, notes}
create or replace function public.enregistrer_commande(p_order_id uuid, p_order jsonb, p_lines jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid := p_order_id; n int;
begin
  if v_id is null then
    insert into public.orders (season_id, client_id, delivery_date, status, channel, notes)
    values ((p_order->>'season_id')::uuid, nullif(p_order->>'client_id', '')::uuid,
            (p_order->>'delivery_date')::date, coalesce(p_order->>'status', 'confirmee'),
            p_order->>'channel', p_order->>'notes')
    returning id into v_id;
  else
    update public.orders set
      client_id = nullif(p_order->>'client_id', '')::uuid,
      delivery_date = (p_order->>'delivery_date')::date,
      status = coalesce(p_order->>'status', status),
      channel = p_order->>'channel',
      notes = p_order->>'notes'
    where id = v_id and status <> 'livree';
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Commande introuvable, inaccessible ou déjà livrée'; end if;
    delete from public.order_lines where order_id = v_id;
  end if;
  perform public._inserer_lignes_commande(v_id, coalesce(p_lines, '[]'::jsonb));
  return v_id;
end; $$;

-- Livrer et facturer : la vente, ses lignes et la commande soldée, d'un bloc.
-- Le verrou FOR UPDATE empêche deux factures pour une même commande
-- (double clic, deux téléphones).
create or replace function public.livrer_commande(p_order_id uuid, p_sale jsonb, p_lines jsonb)
returns uuid language plpgsql set search_path = '' as $$
declare o public.orders%rowtype; v_sale uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Commande introuvable ou inaccessible'; end if;
  if o.sale_id is not null or o.status = 'livree' then raise exception 'Commande déjà livrée et facturée'; end if;
  if o.status = 'annulee' then raise exception 'Commande annulée'; end if;
  v_sale := public.enregistrer_vente(
    p_sale || jsonb_build_object('season_id', o.season_id, 'order_id', o.id,
                                 'client_id', coalesce(p_sale->>'client_id', o.client_id::text)),
    p_lines);
  update public.orders set sale_id = v_sale, status = 'livree' where id = o.id;
  return v_sale;
end; $$;

-- Supprimer une vente : la commande qu'elle soldait redevient « prête ».
create or replace function public.supprimer_vente(p_sale_id uuid)
returns uuid language plpgsql set search_path = '' as $$
declare v_order uuid; n int;
begin
  update public.orders set status = 'prete', sale_id = null where sale_id = p_sale_id returning id into v_order;
  delete from public.sales where id = p_sale_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Vente introuvable ou inaccessible'; end if;
  return v_order;
end; $$;

revoke execute on function
  public._inserer_lignes_vente(uuid, jsonb), public._inserer_lignes_commande(uuid, jsonb),
  public.enregistrer_vente(jsonb, jsonb), public.enregistrer_commande(uuid, jsonb, jsonb),
  public.livrer_commande(uuid, jsonb, jsonb), public.supprimer_vente(uuid)
from public, anon;
grant execute on function
  public._inserer_lignes_vente(uuid, jsonb), public._inserer_lignes_commande(uuid, jsonb),
  public.enregistrer_vente(jsonb, jsonb), public.enregistrer_commande(uuid, jsonb, jsonb),
  public.livrer_commande(uuid, jsonb, jsonb), public.supprimer_vente(uuid)
to authenticated;
