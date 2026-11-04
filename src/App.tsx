import { Navigate, Route, Routes } from 'react-router-dom'
import { supabaseConfigured } from './lib/supabase'
import { BusinessProvider } from './context/BusinessContext'
import { GuestOnly, RequireAuth, RequireBusiness, RequirePlatformAdmin } from './components/guards'
import PanelLayout from './components/PanelLayout'
import Landing from './pages/Landing'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Recover from './pages/auth/Recover'
import NewPassword from './pages/auth/NewPassword'
import CreateBusiness from './pages/CreateBusiness'
import Invitation from './pages/Invitation'
import Dashboard from './pages/panel/Dashboard'
import Team from './pages/panel/Team'
import BusinessSettings from './pages/panel/BusinessSettings'
import PlanPage from './pages/panel/PlanPage'
import Services from './pages/panel/Services'
import Professionals from './pages/panel/Professionals'
import Agenda from './pages/panel/agenda/Agenda'
import Clients from './pages/panel/Clients'
import Cash from './pages/panel/Cash'
import ManageBooking from './pages/ManageBooking'
import SuperAdmin from './pages/admin/SuperAdmin'
import PublicBusiness from './pages/PublicBusiness'
import { useBusiness } from './context/BusinessContext'
import type { ReactNode } from 'react'

function ManagersOnly({ children }: { children: ReactNode }) {
  const { can } = useBusiness()
  return can('manage') ? <>{children}</> : <Navigate to="/panel" replace />
}

export default function App() {
  if (!supabaseConfigured) {
    return <div className="grid min-h-[100dvh] place-items-center p-6 text-center text-volt-muted">Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.</div>
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/ingresar" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/registro" element={<GuestOnly><Register /></GuestOnly>} />
      <Route path="/recuperar" element={<Recover />} />
      <Route path="/nueva-clave" element={<NewPassword />} />
      <Route path="/crear-negocio" element={<RequireAuth><CreateBusiness /></RequireAuth>} />
      <Route path="/invitacion/:token" element={<RequireAuth><Invitation /></RequireAuth>} />
      <Route path="/superadmin" element={<RequireAuth><RequirePlatformAdmin><SuperAdmin /></RequirePlatformAdmin></RequireAuth>} />
      <Route
        path="/panel"
        element={<RequireAuth><RequireBusiness><BusinessProvider><PanelLayout /></BusinessProvider></RequireBusiness></RequireAuth>}
      >
        <Route index element={<Dashboard />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="caja" element={<ManagersOnly><Cash /></ManagersOnly>} />
        <Route path="servicios" element={<ManagersOnly><Services /></ManagersOnly>} />
        <Route path="profesionales" element={<ManagersOnly><Professionals /></ManagersOnly>} />
        <Route path="equipo" element={<Team />} />
        <Route path="negocio" element={<ManagersOnly><BusinessSettings /></ManagersOnly>} />
        <Route path="plan" element={<ManagersOnly><PlanPage /></ManagersOnly>} />
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Route>
      <Route path="/turno/:token" element={<ManageBooking />} />
      <Route path="/:slug" element={<PublicBusiness />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
