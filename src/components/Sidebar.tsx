'use client'

export default function Sidebar({ sections, activeSection, onNav, ctx, mobileOpen }: {
  sections: readonly { id: string; label: string; icon: string }[]
  activeSection: string
  onNav: (id: string) => void
  ctx: any
  mobileOpen: boolean
}) {
  return (
    <nav className={`fixed inset-y-0 left-0 w-64 bg-brun-dark text-cream flex flex-col z-40 transition-transform duration-300
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>

      <div className="px-6 pt-7 pb-5 border-b border-white/10">
        <h1 className="font-serif italic text-2xl text-blush-light tracking-wide">Bleuenn</h1>
        <p className="text-xs text-terre-light mt-1 opacity-80">
          {ctx.profile?.farm_name || 'Ferme Florale'}
          {ctx.profile?.owner_name ? ` — ${ctx.profile.owner_name}` : ''}
        </p>
      </div>

      <div className="flex-1 py-4 overflow-y-auto">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => onNav(s.id)}
            className={`w-full flex items-center gap-3 px-6 py-3 text-left text-sm transition-all border-l-[3px]
              ${activeSection === s.id
                ? 'bg-sage/20 border-sage-light text-blush-light font-semibold'
                : 'border-transparent text-cream hover:bg-white/5'}`}
          >
            <span className="text-base w-6 text-center">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-white/10 space-y-2">
        {ctx.seasons.length > 0 && (
          <select
            className="w-full px-2 py-2 rounded-md bg-white/10 text-cream text-xs border-none"
            value={ctx.activeSeason?.id || ''}
            onChange={e => ctx.switchSeason(e.target.value)}
          >
            {ctx.seasons.map((s: any) => (
              <option key={s.id} value={s.id} className="bg-brun-dark text-cream">{s.name}</option>
            ))}
          </select>
        )}
        <button
          onClick={ctx.signOut}
          className="w-full px-2 py-2 text-xs border border-white/20 rounded-md text-blush-light hover:bg-white/5 transition"
        >
          Déconnexion
        </button>
      </div>
    </nav>
  )
}
