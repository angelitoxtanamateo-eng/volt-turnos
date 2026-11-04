import type { ReactNode } from 'react'
import { Logo } from '../../components/ui'

export default function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-volt-violet/25 blur-[120px]" />
      <div className="relative mx-auto w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo size="lg" /></div>
        <div className="card p-6 animate-fade-up">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-volt-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-volt-muted">{footer}</div>}
      </div>
    </div>
  )
}
