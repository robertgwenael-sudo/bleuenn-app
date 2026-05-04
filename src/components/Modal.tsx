'use client'

export default function Modal({ open, onClose, children }: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 bg-brun-dark/30 backdrop-blur-[2px] overflow-y-auto"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center p-4">
        <div
          className="bg-white rounded-card p-8 max-w-lg w-full shadow-card-lg border border-lin-dark/40 animate-fade-in my-auto"
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
