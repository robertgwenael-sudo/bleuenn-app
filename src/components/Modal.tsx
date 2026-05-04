'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function Modal({ open, onClose, children }: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-brun-dark/30 backdrop-blur-[2px] overflow-y-auto"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center p-4">
        <div
          className="bg-white rounded-card p-8 max-w-lg w-full shadow-card-lg border border-lin-dark/40"
          style={{ animation: 'fadeIn 0.2s ease-out' }}
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
