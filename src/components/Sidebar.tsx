'use client'

export default function Sidebar({ sections, activeSection, onNav, ctx, mobileOpen }: {
  sections: readonly { id: string; label: string; icon: string }[]
  activeSection: string
  onNav: (id: string) => void
  ctx: any
  mobileOpen: boolean
}) {
  return (
    <nav className={`fixed inset-y-0 left-0 w-64 flex flex-col z-40 transition-transform duration-300
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      style={{
        background: 'linear-gradient(180deg, #2a3f28 0%, #3d5a3a 40%, #4a6547 100%)',
      }}
    >
      {/* Logo & ferme */}
      <div className="px-6 pt-8 pb-6 border-b border-white/10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-lg">
            <span style={{ filter: 'brightness(1.5)' }}>&#x273F;</span>
          </div>
          <div>
            <h1 className="font-serif italic text-2xl text-rose-light tracking-wide leading-none">Bleuenn</h1>
            <p className="text-[0.6rem] text-white/40 uppercase tracking-[0.2em] mt-0.5">Ferme Florale</p>
          </div>
        </div>
        <p className="text-xs text-white/50 mt-2 pl-0.5">
          {ctx.profile?.farm_name || 'Ma ferme'}
          {ctx.profile?.owner_name ? ` — ${ctx.profile.owner_name}` : ''}
        </p>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-3 overflow-y-auto">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => onNav(s.id)}
            className={`w-full flex items-center gap-3 px-6 py-3 text-left text-[0.82rem] transition-all duration-200
              ${activeSection === s.id
                ? 'bg-white/12 text-rose-light font-bold border-l-[3px] border-rose'
                : 'border-l-[3px] border-transparent text-white/70 hover:bg-white/5 hover:text-white'}`}
          >
            <span className="text-base w-6 text-center opacity-80">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Pied : saison + déconnexion */}
      <div className="px-6 py-4 border-t border-white/10 space-y-2">
        {ctx.seasons.length > 0 && (
          <select
            className="w-full px-3 py-2 rounded-btn bg-white/10 text-white/80 text-xs border border-white/10 focus:outline-none focus:border-rose/40"
            value={ctx.activeSeason?.id || ''}
            onChange={e => ctx.switchSeason(e.target.value)}
          >
            {ctx.seasons.map((s: any) => (
              <option key={s.id} value={s.id} className="bg-feuille-dark text-white">{s.name}</option>
            ))}
          </select>
        )}
        <button
          onClick={ctx.signOut}
          className="w-full px-3 py-2 text-xs border border-white/15 rounded-btn text-rose-light/80 hover:bg-white/5 hover:text-rose-light transition"
        >
          Deconnexion
        </button>
      </div>
    </nav>
  )
}
