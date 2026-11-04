# VOLT Turnos ⚡

Plataforma SaaS multiempresa de turnos para peluquerías, barberías, uñas y estética.
Propiedad de **VOLT Soluciones Digitales**.

- **Frontend:** React + TypeScript + Tailwind (Vite) → Netlify
- **Backend:** Supabase (Postgres, Auth, RLS, Storage) — proyecto `volt-turnos`

## Arquitectura

```
Navegador ──► Netlify (SPA React)
                 │  clave pública (sb_publishable_…)
                 ▼
           Supabase API ──► Postgres con RLS en todas las tablas
                 │
                 └─ Edge Functions (Etapa 6/8: webhooks Mercado Pago, WhatsApp) con secretos del servidor
```

**Multiempresa (multi-tenant):** una sola base, una sola app. Cada fila de negocio cuelga de
`businesses.id` y las políticas RLS solo dejan leer/escribir a miembros de ese negocio
(`has_business_role`). La página pública usa la función `get_public_business`, que expone
solo campos públicos. Nunca se usa la `service_role` en el frontend.

### Tablas (Etapa 1)

| Tabla | Para qué |
|---|---|
| `profiles` | Datos del usuario (se crea solo al registrarse) |
| `businesses` | Cada negocio (tenant): slug, marca, contacto, estado, publicado |
| `business_members` | Usuario ↔ negocio con rol `owner` / `admin` / `professional` |
| `business_invitations` | Invitaciones por link (se comparten por WhatsApp) |
| `plans` | Starter / Pro / Business, precios editables por superadmin |
| `subscriptions` | Plan y estado de cada negocio (prueba, activa, vencida…) |
| `platform_admins` | Superadmins de VOLT |
| `platform_settings` | Días de prueba, plan de prueba, límite de negocios por cuenta |
| `reserved_slugs` | Direcciones que no se pueden usar (`admin`, `panel`, …) |

### Roles y permisos

| Acción | Propietario | Admin | Profesional | Superadmin VOLT |
|---|:-:|:-:|:-:|:-:|
| Ver su negocio y equipo | ✅ | ✅ | ✅ | ✅ (todos) |
| Editar datos del negocio / publicar | ✅ | ✅ | ❌ | ✅ |
| Invitar profesionales | ✅ | ✅ | ❌ | ✅ |
| Invitar administradores / cambiar roles | ✅ | ❌ | ❌ | ✅ |
| Ver suscripción | ✅ | ✅ | ❌ | ✅ |
| Cambiar plan / estado de suscripción | ❌ | ❌ | ❌ | ✅ (o webhook de pago) |
| Suspender / reactivar negocio | ❌ | ❌ | ❌ | ✅ |
| Editar precios de planes y prueba | ❌ | ❌ | ❌ | ✅ |

### Estructura

```
supabase/migrations/   SQL aplicado en Supabase (fuente de verdad del esquema)
src/lib/               cliente Supabase, tipos, utilidades (WhatsApp, slugs)
src/context/           sesión (AuthContext) y negocio actual (BusinessContext)
src/components/        layout del panel, guardas de rutas, UI reutilizable
src/pages/auth/        ingresar, registro, recuperar, nueva clave
src/pages/panel/       inicio, equipo, mi negocio, plan
src/pages/admin/       panel superadmin VOLT
src/pages/             landing, crear negocio, invitación, página pública /:slug
```

## Etapas

1. ✅ Autenticación, base de datos, multiempresa, roles, RLS
2. 🟡 Página pública con reservas ✅ — falta: subir logo/portada, editor de colores con vista previa
3. ✅ Turnero público (servicios → profesional → día/hora → datos), cancelar/reprogramar por link,
   agenda día/semana/mes, bloqueos, anti-solapamiento en base de datos (exclusion constraint)
4. ✅ Servicios, profesionales con horarios y descansos, CRM (historial, frecuentes, inactivos, notas, CSV)
5. ✅ Caja: cobro al completar, medios de pago, gastos, ganancia, comisiones (Business), reporte CSV
6. ⏳ Planes y suscripciones con Mercado Pago (webhooks en Edge Functions)
7. ⏳ Panel superadmin completo
8. ⏳ Notificaciones (WhatsApp Cloud API) y lista de espera
9. ⏳ Pruebas, seguridad y despliegue final

## Hacerse superadmin

En Supabase → SQL Editor:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'TU_EMAIL';
```

## Variables de entorno

Solo claves **públicas** (ver `.env.production`). Los secretos (Mercado Pago, WhatsApp) irán
como secretos de Edge Functions en Supabase, nunca en este repo.
