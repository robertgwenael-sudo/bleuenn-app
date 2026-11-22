# Bleuenn — gestion de ferme florale

Application web de gestion d'une ferme florale : plan de culture, jardins et planches
permanents, calendrier sur 12 mois glissants, tâches du mois, récoltes et pertes,
prévu face au réel, disponibilités et fiche fleuristes, clients, commandes et ventes,
coûts et rentabilité par culture, exports CSV, installation sur téléphone et saisie hors ligne.

- **Interface** : Next.js 16 (App Router), React 19, Tailwind, déployée sur Vercel
  (`main` → production).
- **Données** : Supabase (PostgreSQL, Auth, Row Level Security), projet `BLEUEN`.
- **Logique métier** : `src/lib/domain`, pure et testée (`npm test`).

## Démarrer

```bash
npm ci
cp .env.local.example .env.local   # URL et clé anon du projet Supabase
npm run dev
```

Sans base : `NEXT_PUBLIC_DEMO=1 npm run dev` lance l'application sur des données
fictives en mémoire (n'importe quel email / mot de passe).

## Base de données

Les migrations `supabase/migrations/001` à `012` sont appliquées en production ;
`013` à `016` sont écrites et testées (PostgreSQL 16, base au format de la prod),
à appliquer dans l'ordre 013, 014, 015, 016. Toute nouvelle migration se teste
d'abord dans une transaction annulée (voir `CLAUDE.md`), puis s'applique.

| Migration | Contenu |
|---|---|
| 001–003 | schéma initial, calcul des dates, partage d'équipe |
| 004 | sécurité : RLS revue, fonctions verrouillées, vue soumise à la RLS |
| 005 | clients, commandes et ventes en lignes, pertes, tâches, réel par plantation |
| 006 | la ferme devient permanente (jardins, équipe), duplication de plan |
| 007 | écritures commerciales atomiques (vente, commande, livraison) |
| 008 | dépenses, temps passé, taux horaire de la ferme |
| 009 | journal de culture, photos (bucket privé), registre des traitements |
| 010 | factures, avoirs, paiements (numérotation continue, documents figés) |
| 011 | fournisseurs, bons de commande, réception vers les dépenses |
| 012 | justificatifs (bucket privé), comptes, relevés CSV, rapprochement |
| 013 | vivaces et bisannuelles (début de floraison, délai avant 1re floraison), plant acheté, arrachage, catalogue aligné sur la charte |
| 014 | TVA par taux (paramétrage par ferme), bons de commande numérotés, livrer et facturer |
| 015 | production du tableur (plants, graines, tiges, revenu), pertes réglables, pépinière |
| 016 | saisons en années civiles, passer une saison à l'année suivante, préparer l'année suivante |

## Réglages Supabase à faire dans le tableau de bord

- Authentication → URL Configuration : Site URL `https://bleuenn-app.vercel.app`,
  redirection `https://bleuenn-app.vercel.app/reset-password`.
- Authentication → inscriptions : désactiver les inscriptions libres ; inviter
  depuis Authentication → Users → Invite user.
- Plan Pro recommandé : sauvegardes quotidiennes, pas de mise en pause,
  protection contre les mots de passe compromis.

Voir `CLAUDE.md` pour les règles de développement.
