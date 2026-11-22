// Lint : garde-fou, pas chantier de style.
// ESLint épinglé en 9.39.5 : eslint-plugin-react 7.37, eslint-plugin-import 2.32
// et eslint-plugin-jsx-a11y 6.10 (tirés par eslint-config-next 16.4.6) déclarent
// un peer ESLint <= 9. Le crash `scopeManager.addGlobals` vu sur un autre projet
// ne se reproduit plus avec 16.4.6 + ESLint 10.15, mais on reste dans les peers.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // ~150 `any` hérités (client démo, lignes Supabase non typées) : les
      // typer est un chantier à part. Signalés, non bloquants.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Règles du React Compiler (eslint-plugin-react-hooks 7), que le projet
      // n'active pas. `useEffect(() => { load() }, [load])` est l'idiome de
      // chargement de tous les hooks ; le réécrire serait une refonte.
      // static-components et immutability restent bloquantes (vrais bugs).
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'node_modules/**',
    '.claude/**',
    'public/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
  ]),
])
