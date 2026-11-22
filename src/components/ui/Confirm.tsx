'use client'
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog } from './Dialog'
import { Button } from './Button'

type ConfirmOptions = {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const Ctx = createContext<ConfirmFn | null>(null)

/** Remplace window.confirm() : renvoie une promesse résolue par le choix. */
export function useConfirm(): ConfirmFn {
  const fn = useContext(Ctx)
  if (!fn) throw new Error('useConfirm doit être utilisé sous <ConfirmProvider>')
  return fn
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const [open, setOpen] = useState(false)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>(o => {
    setOpts(o)
    setOpen(true)
    return new Promise<boolean>(resolve => { resolver.current = resolve })
  }, [])

  const close = (v: boolean) => {
    setOpen(false)
    resolver.current?.(v)
    resolver.current = null
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onOpenChange={o => { if (!o) close(false) }}
        size="sm"
        title={
          <span className="flex items-center gap-2.5">
            {opts?.destructive && (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-danger-soft text-danger">
                <AlertTriangle className="h-4 w-4" aria-hidden />
              </span>
            )}
            {opts?.title}
          </span>
        }
        description={opts?.description}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>{opts?.cancelLabel || 'Annuler'}</Button>
            <Button variant={opts?.destructive ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {opts?.confirmLabel || 'Confirmer'}
            </Button>
          </>
        }
      />
    </Ctx.Provider>
  )
}
