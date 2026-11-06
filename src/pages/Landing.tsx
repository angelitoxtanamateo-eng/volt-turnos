import { Link } from 'react-router-dom'
import { CalendarCheck, Palette, Users, Wallet, MessageCircle, ShieldCheck, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Logo } from '../components/ui'
import InstallApp from '../components/InstallApp'

const FEATURES = [
  { icon: <CalendarCheck className="h-5 w-5" />, title: 'Turnos 24/7', text: 'Tus clientes reservan solos desde tu link: turnos, clases con cupos o pedidos por cantidad.' },
  { icon: <Palette className="h-5 w-5" />, title: 'Tu marca', text: 'Página con tu logo, colores y fotos. Plantillas para cada rubro.' },
  { icon: <Users className="h-5 w-5" />, title: 'Tu equipo', text: 'Cada profesional con su agenda, horarios y servicios.' },
  { icon: <Wallet className="h-5 w-5" />, title: 'Caja y clientes', text: 'Ingresos del día, historial y clientes frecuentes.' },
  { icon: <MessageCircle className="h-5 w-5" />, title: 'WhatsApp', text: 'Confirmaciones y recordatorios con un toque.' },
  { icon: <ShieldCheck className="h-5 w-5" />, title: 'Datos seguros', text: 'Cada negocio ve solo lo suyo. Siempre.' },
]

export default function Landing() {
  const { user } = useAuth()
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-56 left-1/2 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-volt-violet/25 blur-[140px]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        {user
          ? <Link to="/panel" className="btn-primary py-2.5 text-sm">Ir al panel</Link>
          : <div className="flex gap-2"><Link to="/ingresar" className="btn-ghost py-2.5 text-sm">Ingresar</Link><Link to="/registro" className="btn-primary hidden py-2.5 text-sm sm:inline-flex">Probar gratis</Link></div>}
      </header>

      <section className="relative mx-auto max-w-3xl px-4 pb-16 pt-14 text-center sm:pt-20">
        <span className="chip bg-volt-violet/15 text-volt-violet2">Peluquerías, barberías, estética, gimnasios, comidas y más</span>
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          Tu agenda llena,<br /><span className="bg-gradient-to-r from-volt-violet2 to-fuchsia-400 bg-clip-text text-transparent">sin contestar mensajes.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-volt-muted">
          Tus clientes eligen qué quieren, con quién y a qué hora desde un link. Vos te enfocás en atender.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to={user ? '/panel' : '/registro'} className="btn-primary px-6 py-3.5 text-base">
            Crear mi negocio gratis <ArrowRight className="h-4 w-4" />
          </Link>
          <span className="text-sm text-volt-muted">15 días gratis · sin tarjeta</span>
          <InstallApp variant="button" />
        </div>
      </section>

      <section className="relative mx-auto grid max-w-6xl gap-3 px-4 pb-20 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-volt-violet/15 text-volt-violet2">{f.icon}</div>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-volt-muted">{f.text}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-volt-line py-8 text-center text-sm text-volt-muted">
        VOLT Turnos · un producto de <b className="text-volt-white">VOLT Soluciones Digitales</b> ⚡
      </footer>
    </div>
  )
}
