import { useEffect, useState } from 'react'
import { Download, Share, PlusSquare, MoreVertical } from 'lucide-react'
import Modal from './Modal'

interface PromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: PromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as PromptEvent; listeners.forEach((f) => f()) })
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()) })
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** Botón "Instalar app": usa el instalador nativo en Android/Chrome y muestra pasos en iPhone */
export default function InstallApp({ variant = 'nav' }: { variant?: 'nav' | 'card' | 'button' }) {
  const [, force] = useState(0)
  const [help, setHelp] = useState(false)
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    const f = () => { force((n) => n + 1); setInstalled(isStandalone()) }
    listeners.add(f)
    return () => { listeners.delete(f) }
  }, [])

  if (installed) return null

  async function install() {
    if (deferred) {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') { deferred = null; setInstalled(true) }
    } else {
      setHelp(true)
    }
  }

  const ios = isIos()
  const trigger =
    variant === 'card' ? (
      <div className="card flex items-center gap-4 p-4">
        <img src="/icon-192.png" alt="" className="h-12 w-12 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Instalá VOLT Turnos en tu celu</div>
          <div className="text-xs text-volt-muted">Ícono en tu pantalla, abre al toque y a pantalla completa.</div>
        </div>
        <button className="btn-primary py-2 text-sm" onClick={install}><Download className="h-4 w-4" /> Instalar</button>
      </div>
    ) : variant === 'button' ? (
      <button className="btn-ghost py-2.5 text-sm" onClick={install}><Download className="h-4 w-4" /> Instalar app</button>
    ) : (
      <button onClick={install} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-volt-muted hover:bg-white/5 hover:text-volt-white">
        <Download className="h-[18px] w-[18px]" /> Instalar app
      </button>
    )

  return (
    <>
      {trigger}
      <Modal open={help} onClose={() => setHelp(false)} title="Instalar la app">
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-3">
            <img src="/icon-192.png" alt="" className="h-14 w-14 rounded-2xl" />
            <div><div className="font-semibold">VOLT Turnos</div><div className="text-volt-muted">Gratis · sin Play Store</div></div>
          </div>
          {ios ? (
            <ol className="space-y-3">
              <li className="flex items-center gap-3"><Step n={1} /> Abrí esta página en <b>Safari</b>.</li>
              <li className="flex items-center gap-3"><Step n={2} /> Tocá <Share className="inline h-4 w-4 text-volt-violet2" /> <b>Compartir</b> (abajo).</li>
              <li className="flex items-center gap-3"><Step n={3} /> Elegí <PlusSquare className="inline h-4 w-4 text-volt-violet2" /> <b>Agregar a inicio</b>.</li>
            </ol>
          ) : (
            <ol className="space-y-3">
              <li className="flex items-center gap-3"><Step n={1} /> Abrí esta página en <b>Chrome</b>.</li>
              <li className="flex items-center gap-3"><Step n={2} /> Tocá <MoreVertical className="inline h-4 w-4 text-volt-violet2" /> (arriba a la derecha).</li>
              <li className="flex items-center gap-3"><Step n={3} /> Elegí <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.</li>
            </ol>
          )}
          <p className="text-xs text-volt-muted">Queda el ícono de VOLT Turnos en tu celu y se actualiza sola cada vez que mejoramos algo.</p>
        </div>
      </Modal>
    </>
  )
}

function Step({ n }: { n: number }) {
  return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-volt-violet text-xs font-bold text-white">{n}</span>
}
