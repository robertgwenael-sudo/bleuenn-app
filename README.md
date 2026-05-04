# Bleuenn — Ferme Florale SaaS

Application de gestion de ferme florale avec calendrier automatique, multi-saisons, 100% dynamique.

## Architecture

- **Frontend** : Next.js 14 (App Router) + Tailwind CSS → déployé sur **Vercel**
- **Backend** : **Supabase** (PostgreSQL + Auth + Row Level Security)
- **Calcul automatique** : un trigger PostgreSQL calcule toutes les dates à partir de la date de semis

## Déploiement pas à pas

### 1. Créer le projet Supabase

1. Aller sur [supabase.com](https://supabase.com) → **New Project**
2. Choisir un nom (ex: `bleuenn`), un mot de passe DB, une région (EU West)
3. Une fois créé, aller dans **Settings → API** et noter :
   - `Project URL` → c'est votre `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → c'est votre `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Exécuter la migration SQL

1. Dans Supabase, aller dans **SQL Editor**
2. Copier-coller le contenu de `supabase/migrations/001_schema.sql`
3. Cliquer **Run** — cela crée toutes les tables, le trigger de calcul automatique, les policies de sécurité, et le catalogue de 49 cultures pré-remplies

### 3. Configurer l'authentification

1. Dans Supabase → **Authentication → Settings**
2. Activer **Email** comme provider
3. (Optionnel) Désactiver la confirmation email pour le dev : **Auth → Settings → Email → Disable confirm email**

### 4. Déployer sur Vercel

```bash
# Cloner ou uploader le dossier bleuenn-app sur GitHub

# Puis sur vercel.com :
# 1. Import Git Repository
# 2. Framework: Next.js (auto-détecté)
# 3. Root Directory: bleuenn-app (si dans un sous-dossier)
# 4. Environment Variables :
#    NEXT_PUBLIC_SUPABASE_URL = https://xxx.supabase.co
#    NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
# 5. Deploy
```

Ou en CLI :

```bash
cd bleuenn-app
npm install
cp .env.local.example .env.local
# Remplir les variables dans .env.local

# Dev local
npm run dev

# Déployer
npx vercel
```

## Comment ça marche

### Flux dynamique

1. **Créer une saison** (ex: "Saison 1 — 2025", objectif 15 000€)
2. **Créer des jardins** avec leur surface (ex: "Jardin A", 95 m²)
3. **Ajouter des planches** dans chaque jardin (ex: "PL 1", 10 m²)
4. **Affecter une culture** à une planche en choisissant :
   - La culture dans le catalogue (49 variétés pré-remplies)
   - **La date de semis** — c'est la seule date à saisir !

### Calcul automatique

À partir de la date de semis, le système calcule tout :

```
Date semis + jours_cellule       = Date plantation
Date plantation + jours_champ    = Date début récolte
Date début récolte + jours_recolte = Date fin récolte
```

Le calendrier, la disponibilité des fleurs, les commandes de graines — tout se met à jour automatiquement.

### Multi-saisons

Créez autant de saisons que nécessaire. Chaque saison a ses propres jardins, planches, cultures, récoltes et ventes. Passez d'une saison à l'autre via le sélecteur dans la sidebar.

## Structure du projet

```
bleuenn-app/
├── supabase/migrations/001_schema.sql   # Schéma complet + seed data
├── src/
│   ├── app/
│   │   ├── layout.tsx                   # Layout racine
│   │   ├── page.tsx                     # Page principale (routeur)
│   │   └── globals.css                  # Styles Tailwind + custom
│   ├── lib/
│   │   ├── supabase.ts                  # Client Supabase
│   │   └── types.ts                     # Types TypeScript + helpers
│   ├── hooks/
│   │   └── useBleuenn.ts                # Hook principal (CRUD complet)
│   └── components/
│       ├── AuthScreen.tsx               # Login / inscription
│       ├── Sidebar.tsx                  # Navigation
│       ├── OnboardingModal.tsx          # Setup première saison
│       ├── Modal.tsx                    # Composant modal réutilisable
│       ├── Dashboard.tsx                # KPIs, alertes, graphiques
│       ├── Gardens.tsx                  # Jardins, planches, plantations
│       ├── Semis.tsx                    # Tableau semis & germination
│       ├── Calendar.tsx                 # Calendrier Gantt automatique
│       ├── Recoltes.tsx                 # Saisie & suivi récoltes
│       ├── Ventes.tsx                   # Ventes par canal
│       ├── Commandes.tsx                # Commandes de graines auto
│       └── Disponibilite.tsx            # Grille disponibilité marché
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── next.config.js
```

## Catalogue de cultures inclus

49 variétés pré-remplies avec leurs données techniques :
Statice, Célosie, Acroclinium, Pavot d'Islande, Nigelle, Gomphrena, Anémone, Renoncule, Tulipe, Delphinium, Immortelle, Craspedia, Ammobium, Scabieuse, Carthame, Cérinthe, Cosmos, Matricaire, Muflier, Lonas, Nielle, Ammi, Basilic, Cloches d'Irlande, Aneth, Godetie, Rudbeckie, Gypsophile, Tagète, Didiscus, Lin, Dahlia, Chrysanthème, Giroflée, Centaurée, Myosotis chinois, Hélenium, Soleil du Mexique, Tournesol, Zinnia, Phlox, Orlaya, Aster de Chine, Achillée, Éringium, Ancolie, Sauge, Origan, Shizo.

Vous pouvez ajouter vos propres cultures au catalogue.
# bleuenn-app
