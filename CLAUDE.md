# Bleuenn

Application de gestion d'une ferme florale (fleurs coupées), utilisée au quotidien
par une agricultrice professionnelle et son équipe. Interface en français, mobile
d'abord pour la saisie au champ.

## Modèle métier

- **La ferme est permanente** (`farms`, `farm_members`) : jardins, planches, équipe
  et catalogue durent d'une année sur l'autre.
- **La saison est une unité de gestion** (CA, objectif, bilan). Une plantation
  appartient à une saison, mais les cultures chevauchent les saisons (renoncules
  semées en automne, récoltées au printemps suivant).
- **L'occupation d'une planche se lit par dates, toutes saisons confondues.**
  Calendrier, tâches et disponibilités s'affichent sur 12 mois glissants ; la
  saison n'est qu'un filtre.
- Les dates de culture découlent de la date de semis :
  plantation = semis + jours_cellule ; récolte = plantation + jours_champ ;
  fin = récolte + jours_recolte (trigger `calc_planting_dates`, vue `plantings_full`).

## Règles non négociables

1. **Montants en centimes** dans tout calcul (`src/lib/domain/montants.ts`). Pas de
   `toFixed` ni de `parseFloat` sur un montant. Le test `garde-fou` l'impose.
2. **Date du jour à l'heure de Paris**, jamais l'UTC ni l'horloge de l'appareil :
   `aujourdhuiParisISO()`. Le domaine (`src/lib/domain`) ne lit jamais l'horloge :
   la date est un paramètre.
3. **Aucune erreur Supabase avalée** : `const { data } = await …` sans regarder
   `error` affiche « aucun élément » là où la requête a été refusée. Toast et
   `console.error` systématiques.
4. **RLS sur toutes les tables, au moins une policy par table.** Les tests
   d'appartenance passent par les fonctions `security definer`
   (`my_farm_ids`, `my_season_ids`, `is_team_owner`, `my_teammate_ids`…).
   - `profiles` n'est lisible que par son propriétaire : un join PostgREST vers
     `profiles` rend `null` sans erreur. Utiliser `farm_team()` / `season_team()`.
   - Une policy de lecture qui doit couvrir une ligne tout juste insérée ne peut
     pas dépendre seulement d'une fonction `stable` qui relit une table modifiée
     par trigger dans la même instruction (`INSERT … RETURNING` refusé) : ajouter
     une comparaison directe (`user_id = auth.uid()`, `created_by = auth.uid()`).
5. **Écritures multi-tables atomiques** : vente ou commande avec lignes, livraison,
   suppression de vente passent par les fonctions SQL de la migration 007.
6. **Migrations testées avant application** : rejouer la migration et des
   scénarios (owner, membre, compte étranger, anonyme) dans une transaction
   terminée par `raise exception` puis `rollback`, et n'appliquer qu'ensuite.

## Structure

    src/lib/domain/   logique métier pure + tests vitest (dates, montants, occupation,
                      tâches, prévu/réel, disponibilités, ventes, duplication de plan)
    src/hooks/        useBleuenn (ferme, saison, données de base), useTaches,
                      useReel, useCommercial
    src/components/   écrans ; ui/ design system ; shell/ navigation (nav.ts)
    src/lib/demo/     faux client Supabase en mémoire (NEXT_PUBLIC_DEMO=1) ;
                      données par domaine dans seeds/
    supabase/migrations/  001 → 008, appliquées en production

## Commandes

    npm run dev                    développement (base réelle, .env.local)
    NEXT_PUBLIC_DEMO=1 npm run dev mode démo, données fictives, rien n'est écrit
    npm test                       tests de la logique métier
    npm run lint                   ESLint 9 (eslint-config-next)
    npm run test:e2e               parcours Playwright en mode démo (E2E_BUILD=1 : build de prod)
    npx tsc --noEmit               types
    npm run build                  build de production

Next.js 16 / React 19 : les API diffèrent des versions précédentes, vérifier dans
`node_modules/next/dist/docs/` plutôt que supposer. Le code de démo doit rester
hors du paquet de production (`NEXT_PUBLIC_DEMO` défini au build dans
`next.config.js`) ; la CI le vérifie.

## Hors ligne

PWA (`src/app/manifest.ts`, `public/sw.js`, actif en production seulement). Les récoltes et
pertes passent par une file locale (`src/lib/offline/`) : UUID client, renvoi idempotent,
rejet définitif visible. Les appels Supabase ne sont jamais mis en cache.

## Choix métier en attente de validation par l'agricultrice

- Pinçage 21 j après plantation ; filet posé à la plantation.
- Prévu réparti dans le temps : RR étalé, RU en une semaine, MP sur la 1re moitié.
- Statut prévu/réel : en avance ≥ 110 %, en retard < 90 %.
- Une semaine appartient au mois de son lundi (vue Tâches).
- Commande : livrer = facturer ; unités par défaut botte 10, bouquet 15, seau 25.
- Disponibilités : seules les commandes confirmées, prêtes ou livrées réservent.
- Rentabilité : frais généraux répartis au prorata surface × jours (ou CA) ; un seul
  taux horaire, vide = temps « non calculable » ; €/heure sur la marge hors temps.
