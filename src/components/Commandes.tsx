'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { PackageCheck, PackageOpen, Sprout } from 'lucide-react'
import type { SeedOrder, PlantingFull } from '@/lib/types'
import { Badge, Card, EmptyState, PageHeader, SearchInput, Stat, TableContainer } from '@/components/ui'
import { photos } from '@/lib/images'

function OrderStatus({ ordered, needed }: { ordered: number; needed: number }) {
  return ordered >= needed && needed > 0
    ? <Badge tone="green" dot>Complet</Badge>
    : ordered > 0
      ? <Badge tone="amber" dot>Partiel</Badge>
      : <Badge tone="rose" dot>À commander</Badge>
}

const checkbox = 'h-5 w-5 cursor-pointer rounded border-border-strong accent-[rgb(var(--primary))]'

export default function Commandes({ ctx }: { ctx: any }) {
  const [search, setSearch] = useState('')
  const orders: SeedOrder[] = ctx.seedOrders || []
  const plantings: PlantingFull[] = ctx.plantings || []

  // Aggregate needed seeds from plantings
  const needsByCulture: Record<string, number> = {}
  plantings.forEach(p => {
    const name = p.culture_name
    needsByCulture[name] = (needsByCulture[name] || 0) + (p.graines_necessaires || 0)
  })

  // Merge with existing orders
  const allCultures = [...new Set([...Object.keys(needsByCulture), ...orders.map(o => o.culture_name)])].sort()

  const getOrder = (name: string) => orders.find(o => o.culture_name === name)

  const totalNeeded = allCultures.reduce((s, c) => s + (needsByCulture[c] || getOrder(c)?.graines_needed || 0), 0)
  const totalOrdered = orders.reduce((s, o) => s + (o.graines_ordered || 0), 0)
  const received = orders.filter(o => o.received).length

  const handleUpdate = (cultureName: string, field: string, value: any) => {
    const updates: any = {}
    if (field === 'graines_ordered') updates.graines_ordered = parseInt(value) || 0
    else if (field === 'supplier') updates.supplier = value
    else if (field === 'bio') updates.bio = value
    else if (field === 'received') updates.received = value
    updates.graines_needed = needsByCulture[cultureName] || getOrder(cultureName)?.graines_needed || 0
    ctx.upsertSeedOrder(cultureName, updates)
  }

  // Retour visuel uniquement quand la valeur a vraiment changé
  const onBlurSave = (name: string, field: 'graines_ordered' | 'supplier', before: string | number, e: React.FocusEvent<HTMLInputElement>) => {
    handleUpdate(name, field, e.target.value)
    if (String(before) !== e.target.value) toast.success(`${name} : commande mise à jour`)
  }

  const visible = allCultures.filter(n => n.toLowerCase().includes(search.trim().toLowerCase()) ||
    (getOrder(n)?.supplier || '').toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div>
      <PageHeader title="Commandes de graines" description="Calculées automatiquement depuis vos plantations" image={photos.semisGodets} />

      <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label="Total nécessaire" value={totalNeeded.toLocaleString('fr-FR')} sub="graines" icon={<Sprout />} />
        <Stat label="Commandées" value={totalOrdered.toLocaleString('fr-FR')} sub="graines" icon={<PackageOpen />} />
        <Stat label="Reçues" value={`${received} / ${orders.length}`} sub="commandes" icon={<PackageCheck />} />
      </div>

      {allCultures.length === 0 ? (
        <Card>
          <EmptyState image={photos.semisGodets} title="Aucun besoin en graines"
            description="Les commandes se rempliront automatiquement quand vous ajouterez des cultures." />
        </Card>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Culture ou fournisseur…" className="sm:w-72" label="Rechercher une commande" />
            <p className="text-xs text-fg-subtle sm:ml-auto">Les champs s’enregistrent quand vous les quittez.</p>
          </div>

          {/* Mobile : cartes éditables */}
          <ul className="space-y-2 md:hidden">
            {visible.map(name => {
              const needed = needsByCulture[name] || getOrder(name)?.graines_needed || 0
              const order = getOrder(name)
              const ordered = order?.graines_ordered || 0
              return (
                <li key={name} className="rounded-xl border border-border bg-surface p-3.5 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-fg">{name}</p>
                      <p className="num text-xs text-fg-muted">{needed.toLocaleString('fr-FR')} graines nécessaires</p>
                    </div>
                    <OrderStatus ordered={ordered} needed={needed} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="text-xs text-fg-muted">Commandées
                      <input type="number" inputMode="numeric" className="field-control mt-1 h-11" defaultValue={ordered} min={0}
                        onBlur={e => onBlurSave(name, 'graines_ordered', ordered, e)} />
                    </label>
                    <label className="text-xs text-fg-muted">Fournisseur
                      <input type="text" className="field-control mt-1 h-11" defaultValue={order?.supplier || ''} placeholder="Fournisseur"
                        onBlur={e => onBlurSave(name, 'supplier', order?.supplier || '', e)} />
                    </label>
                  </div>
                  <div className="mt-3 flex gap-5 text-sm text-fg">
                    <label className="flex items-center gap-2"><input type="checkbox" className={checkbox} checked={order?.bio || false}
                      onChange={e => handleUpdate(name, 'bio', e.target.checked)} />Bio</label>
                    <label className="flex items-center gap-2"><input type="checkbox" className={checkbox} checked={order?.received || false}
                      onChange={e => handleUpdate(name, 'received', e.target.checked)} />Reçu</label>
                  </div>
                </li>
              )
            })}
          </ul>

          <TableContainer className="hidden md:block" label="Commandes de graines">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Culture</th>
                  <th className="!text-right">Graines nécessaires</th>
                  <th>Commandées</th>
                  <th>Fournisseur</th>
                  <th className="!text-center">Bio</th>
                  <th>Statut</th>
                  <th className="!text-center">Reçu</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(name => {
                  const needed = needsByCulture[name] || getOrder(name)?.graines_needed || 0
                  const order = getOrder(name)
                  const ordered = order?.graines_ordered || 0
                  return (
                    <tr key={name}>
                      <td className="font-medium">{name}</td>
                      <td className="num text-right">{needed.toLocaleString('fr-FR')}</td>
                      <td>
                        <input type="number" aria-label={`Graines commandées — ${name}`} className="field-control !min-h-0 h-8 w-24 text-right"
                          defaultValue={ordered} min={0} onBlur={e => onBlurSave(name, 'graines_ordered', ordered, e)} />
                      </td>
                      <td>
                        <input type="text" aria-label={`Fournisseur — ${name}`} className="field-control !min-h-0 h-8 w-44"
                          defaultValue={order?.supplier || ''} placeholder="Fournisseur" onBlur={e => onBlurSave(name, 'supplier', order?.supplier || '', e)} />
                      </td>
                      <td className="text-center">
                        <input type="checkbox" aria-label={`Bio — ${name}`} className={checkbox} checked={order?.bio || false}
                          onChange={e => handleUpdate(name, 'bio', e.target.checked)} />
                      </td>
                      <td><OrderStatus ordered={ordered} needed={needed} /></td>
                      <td className="text-center">
                        <input type="checkbox" aria-label={`Reçu — ${name}`} className={checkbox} checked={order?.received || false}
                          onChange={e => handleUpdate(name, 'received', e.target.checked)} />
                      </td>
                    </tr>
                  )
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={7} className="py-10 text-center text-fg-muted">Aucune culture ne correspond à « {search} ».</td></tr>
                )}
              </tbody>
            </table>
          </TableContainer>
        </>
      )}
    </div>
  )
}
