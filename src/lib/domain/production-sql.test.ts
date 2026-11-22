// Le trigger SQL de la migration 015 (calc_planting_dates) et le domaine TS
// (production.ts) doivent donner EXACTEMENT les mêmes chiffres sur les cas de
// contrôle du tableur de Marine.
//
// Ce test a besoin d'une base PostgreSQL où les migrations 001 à 012 (et 013
// si elle existe) sont appliquées, 015 NON appliquée : il rejoue 015 dans une
// transaction, insère les cas, relit les colonnes calculées, puis ROLLBACK.
// Rien n'est écrit. Sans base, il est ignoré (et le dit).
//
//   BLEUENN_TEST_PG="postgresql://postgres@localhost/bleuenn_test" npx vitest run src/lib/domain/production-sql.test.ts
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { calculerProduction, type Calcul, type TauxPertes } from './production'

const PG = process.env.BLEUENN_TEST_PG
const MIGRATION = join(__dirname, '../../../supabase/migrations/015_production.sql')

// [nom, m², graines/motte, rangs, espacement, rendement, prix, plant acheté]
type Cas = [string, number, number | null, number | null, number | null, number | null, number | null, boolean]
const CAS: Cas[] = [
  ['Statice', 20, 1, 5, 20, 3, 0.5, false],
  ['Ammi 5', 5, 2, 3, 30, 3, 0.5, false],
  ['Ammi 20', 20, 2, 3, 30, 3, 0.5, false],
  ['Achillée', 10, 2, 3, 30, 5, 0.7, false],
  ['Dahlia', 20, 1, 2, 40, 5, 1.2, false],
  ['Dahlia acheté', 20, 1, 2, 40, 5, 1.2, true],
  ['Tulipe', 20, 1, 11, 10, 1, 0.5, false],
  ['Cresson', 5, 1, 45, 2.54, 1, 0.6, false],
  ['Ancolie', 10, 2, 5, 22.86, 3, 0.85, false],
  ['Didiscus', 5, 2, 5, 20, 5, 0.85, false],
  ['Véronique', 10, 1, 4, null, 2, null, false],
  ['Croix de Malte', 10, null, 5, 20, 3, null, false],
]

const lit = (v: number | null) => (v === null ? 'null' : String(v))

function scriptSql(taux: TauxPertes): string {
  const U = '00000000-0000-4000-8000-0000000000aa'
  const S = '00000000-0000-4000-8000-0000000000bb'
  const G = '00000000-0000-4000-8000-0000000000cc'
  const PL = '00000000-0000-4000-8000-0000000000dd'
  const lignes = CAS.map(([nom, m2, f, g, h, i, prix, achat], k) => {
    const c = `00000000-0000-4000-8001-${String(k).padStart(12, '0')}`
    return `insert into public.culture_catalog (id, user_id, name, type, jours_cellule, jours_champ, jours_recolte, rendement_plant, prix_tige, espacement_cm, rangs_par_planche, graines_par_plant)
      values ('${c}', '${U}', '${nom.replace(/'/g, "''")}', 'MP', 25, 60, 21, ${lit(i)}, ${lit(prix)}, ${lit(h)}, ${lit(g)}, ${lit(f)});
    insert into public.plantings (planche_id, culture_id, season_id, surface_m2, date_semis, achat_plant)
      values ('${PL}', '${c}', '${S}', ${m2}, '2026-03-15', ${achat});`
  }).join('\n')
  return `\\set ON_ERROR_STOP 1
\\set QUIET 1
begin;
\\i ${MIGRATION}
alter table public.plantings add column if not exists achat_plant boolean not null default false;
insert into auth.users (id, email) values ('${U}', 'controle@exemple.fr');
insert into public.profiles (id, email, farm_name, owner_name) values ('${U}', 'controle@exemple.fr', 'Contrôle', '') on conflict (id) do nothing;
insert into public.seasons (id, user_id, name, year) values ('${S}', '${U}', 'Contrôle', 2026);
update public.farms set taux_perte_semis = ${taux.semis}, taux_perte_champ = ${taux.champ}
  where id = (select farm_id from public.seasons where id = '${S}');
insert into public.gardens (id, user_id, season_id, name, surface_m2) values ('${G}', '${U}', '${S}', 'Contrôle', 100);
insert into public.planches (id, garden_id, name, surface_m2) values ('${PL}', '${G}', 'PL 1', 20);
${lignes}
\\pset format unaligned
\\pset tuples_only on
\\pset null ''
select c.name, p.plants_count, p.graines_necessaires, p.tiges_estimees, p.revenu_estime
  from public.plantings p join public.culture_catalog c on c.id = p.culture_id where p.season_id = '${S}';
rollback;
`
}

function lireSql(taux: TauxPertes): Map<string, (string | null)[]> {
  const out = execFileSync('psql', [PG!, '-X', '-f', '-'], { input: scriptSql(taux), encoding: 'utf8' })
  const m = new Map<string, (string | null)[]>()
  for (const l of out.split('\n').filter(x => x.includes('|'))) {
    const [nom, ...v] = l.split('|')
    m.set(nom, v.map(x => (x === '' ? null : x)))
  }
  return m
}

const entier = (c: Calcul) => (c.etat === 'ok' ? String(c.valeur) : null)

describe.skipIf(!PG)('trigger 015 et domaine TS : mêmes chiffres', () => {
  for (const taux of [{ semis: 30, champ: 30 }, { semis: 20, champ: 10 }]) {
    it(`cas de contrôle, pertes ${taux.semis} % / ${taux.champ} %`, () => {
      const sql = lireSql(taux)
      expect(sql.size).toBe(CAS.length)
      for (const [nom, m2, f, g, h, i, prix, achat] of CAS) {
        const p = calculerProduction({
          surface_m2: m2, graines_par_plant: f, rangs_par_planche: g, espacement_cm: h, rendement: i, prix_tige: prix,
          jours_recolte: 21, achat_plant: achat,
        }, taux)
        const ts = [
          entier(p.plants),
          achat ? entier(p.plantsAvecPertes) : entier(p.graines),
          entier(p.tigesNettes),
          p.revenu.etat === 'ok' ? `${Math.floor(p.revenu.centimes / 100)}.${String(p.revenu.centimes % 100).padStart(2, '0')}` : null,
        ]
        expect(sql.get(nom), nom).toEqual(ts)
      }
    })
  }
})

describe.skipIf(!!PG)('trigger 015 et domaine TS', () => {
  it.skip('ignoré : BLEUENN_TEST_PG non défini (base PostgreSQL de test absente)', () => {})
})
