'use client'
import type { SeedOrder, PlantingFull } from '@/lib/types'

export default function Commandes({ ctx }: { ctx: any }) {
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

  return (
    <div>
      <h2 className="font-serif text-3xl mb-1">Commandes de graines</h2>
      <p className="text-terre text-sm mb-7">Calculé automatiquement depuis vos plantations</p>

      {/* Stats */}
      <div className="flex gap-3 flex-wrap mb-7">
        <div className="bg-white px-5 py-2 rounded-full text-sm shadow-card">
          Total nécessaire : <strong className="text-sage">{totalNeeded.toLocaleString('fr-FR')}</strong> graines
        </div>
        <div className="bg-white px-5 py-2 rounded-full text-sm shadow-card">
          Commandées : <strong className="text-sage">{totalOrdered.toLocaleString('fr-FR')}</strong>
        </div>
        <div className="bg-white px-5 py-2 rounded-full text-sm shadow-card">
          Reçues : <strong className="text-sage">{received} / {orders.length}</strong>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['Culture', 'Graines nécessaires', 'Commandées', 'Fournisseur', 'Bio', 'Statut', 'Reçu'].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allCultures.map(name => {
              const needed = needsByCulture[name] || getOrder(name)?.graines_needed || 0
              const order = getOrder(name)
              const ordered = order?.graines_ordered || 0
              return (
                <tr key={name} className="hover:bg-cream transition">
                  <td className="table-cell font-semibold">{name}</td>
                  <td className="table-cell">{needed.toLocaleString('fr-FR')}</td>
                  <td className="table-cell">
                    <input
                      type="number"
                      className="input !w-20 !py-1 !px-2 text-sm"
                      defaultValue={ordered}
                      min={0}
                      onBlur={e => handleUpdate(name, 'graines_ordered', e.target.value)}
                    />
                  </td>
                  <td className="table-cell">
                    <input
                      type="text"
                      className="input !w-32 !py-1 !px-2 text-sm"
                      defaultValue={order?.supplier || ''}
                      placeholder="Fournisseur"
                      onBlur={e => handleUpdate(name, 'supplier', e.target.value)}
                    />
                  </td>
                  <td className="table-cell">
                    <input
                      type="checkbox"
                      checked={order?.bio || false}
                      onChange={e => handleUpdate(name, 'bio', e.target.checked)}
                      className="accent-sage w-4 h-4"
                    />
                  </td>
                  <td className="table-cell">
                    {ordered >= needed && needed > 0
                      ? <span className="badge badge-rr">Complet</span>
                      : ordered > 0
                        ? <span className="badge badge-mp">Partiel</span>
                        : <span className="badge badge-ru">À commander</span>}
                  </td>
                  <td className="table-cell">
                    <input
                      type="checkbox"
                      checked={order?.received || false}
                      onChange={e => handleUpdate(name, 'received', e.target.checked)}
                      className="accent-sage w-4 h-4"
                    />
                  </td>
                </tr>
              )
            })}
            {allCultures.length === 0 && (
              <tr><td colSpan={7} className="table-cell text-center text-terre py-8">
                Les commandes se rempliront automatiquement quand vous ajouterez des cultures.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
