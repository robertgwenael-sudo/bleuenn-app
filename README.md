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

Les migrations `supabase/migrations/001` à `008` sont appliquées en production.
Toute nouvelle migration se teste d'abord dans une transaction annulée (voir
`CLAUDE.md`), puis s'applique.

| Migration | Contenu |
|---|---|
| 001–003 | schéma initial, calcul des dates, partage d'équipe |
| 004 | sécurité : RLS revue, fonctions verrouillées, vue soumise à la RLS |
| 005 | clients, commandes et ventes en lignes, pertes, tâches, réel par plantation |
| 006 | la ferme devient permanente (jardins, équipe), duplication de plan |
| 007 | écritures commerciales atomiques (vente, commande, livraison) |
| 008 | dépenses, temps passé, taux horaire de la ferme |

## Réglages Supabase à faire dans le tableau de bord

- Authentication → URL Configuration : Site URL `https://bleuenn-app.vercel.app`,
  redirection `https://bleuenn-app.vercel.app/reset-password`.
- Authentication → inscriptions : désactiver les inscriptions libres ; inviter
  depuis Authentication → Users → Invite user.
- Plan Pro recommandé : sauvegardes quotidiennes, pas de mise en pause,
  protection contre les mots de passe compromis.

Voir `CLAUDE.md` pour les règles de développement.
