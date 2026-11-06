# VOLT Turnos — Estado actual y plan (según GUIA_MAESTRA.md)

Última revisión: 6/11/2026. Stack verificado en el código: React + TypeScript + Tailwind (Vite), Supabase (Postgres con RLS, Auth, Storage, Edge Functions), Netlify.

## Bloqueos que hay que resolver primero

| # | Bloqueo | Quién | Cómo |
|---|---------|-------|------|
| B1 | Netlify no publica desde el 4/11 (lo último online es el commit `ba462e8`). Nada de lo nuevo llega a los usuarios. | Ángel | app.netlify.com → volturnos → Deploys → ver si hay uno fallido (mandar captura) o "Trigger deploy". |
| B2 | Falta el secreto `MP_ACCESS_TOKEN` en Supabase (Edge Functions). Sin eso, el débito automático de suscripciones no funciona. | Ángel | Supabase → Edge Functions → Secrets. En los dos proyectos (Turnos y Presupuestos). |
| B3 | Falta configurar el webhook de Mercado Pago (`/functions/v1/mp-webhook`, evento "Planes y suscripciones"). | Ángel | Panel de desarrolladores de Mercado Pago. |
| B4 | Hay dos negocios de demostración publicados con datos de ejemplo ("Peluquería Demo" y "Alma Catering"). La regla 5 dice "no usar datos ficticios en producción". | Ángel decide | Opción A: despublicarlos y publicarlos solo para mostrar. Opción B: borrarlos cuando cierre la venta. Opción C: mover las demos a un proyecto aparte. |

## Estado por sección de la guía

Leyenda: ✅ hecho y probado en la base · 🟡 parcial · ❌ no existe

| Sección | Estado | Qué hay / qué falta |
|---|---|---|
| 2. Multi-rubro | 🟡 | 17 rubros al registrarse. El rubro sugiere módulos y textos, sin limitar (ver 3). |
| 3. Módulos | 🟡 | Primer paso: módulos de reserva por negocio (Turnos / Clases con cupos / Pedidos por unidad), activables en "Mi negocio" y validados en el servidor. Falta extender el mismo esquema a los demás módulos a medida que existan. |
| 4. Reservas | 🟡 | ✅ día/semana/mes, online y manual, disponibilidad automática, duración, horarios con cortes, bloqueos/feriados, varios servicios, cancelar/reprogramar (cliente y negocio), sin superposición (constraint en la base), anticipación mínima y máxima, historial. ❌ confirmación manual opcional, ❌ estados personalizables. |
| 5. Pagos de clientes (Mercado Pago) | ❌ | Solo existe el cobro de suscripciones de VOLT. Para señas/pagos de cada negocio hace falta que cada negocio conecte su cuenta (OAuth de Mercado Pago). Requiere crear una aplicación en Mercado Pago Developers (client_id/secret), que queda como secreto del servidor. |
| 6. Notificaciones | 🟡 | Hoy: mensajes de WhatsApp armados con un toque (link wa.me, los envía la persona; no se simula nada). ❌ envíos automáticos: necesitan WhatsApp Cloud API (Meta, verificación y costo por mensaje) o un proveedor de email (clave de API). |
| 7. Ubicación / Maps | 🟡 | Dirección y ciudad. ❌ mapa, coordenadas, "Cómo llegar", modalidades (local/domicilio/online), zonas. |
| 8. VOLT Descubrir | ❌ | |
| 9. Página pública | 🟡 | ✅ logo, colores, portada, descripción, servicios, precios, profesionales, reservas, galería, contacto, redes, plantillas. ❌ horarios visibles, preguntas frecuentes, política de cancelación escrita, mapa. |
| 10. Clientes | 🟡 | ✅ registro automático, historial de reservas y pagos, notas, frecuentes. ❌ inactivos, preferencias, estadísticas de asistencia por cliente. |
| 11. Gimnasios | 🟡 | ✅ clases grupales con cupos, cupo controlado en el servidor. ❌ abonos, paquetes, pase libre, descuento automático, vencimientos, recurrentes, lista de espera. |
| 12. Pedidos | 🟡 | ✅ productos por unidad, varios productos por pedido, máximo por producto, pedidos por horario, anticipación. ❌ fotos de producto, variantes, packs, pedido mínimo, notas del cliente, envío/zonas/costo, señas, estados de pedido. |
| 13. Equipo | ✅/🟡 | ✅ roles (dueño, administrador, profesional), permisos por RLS, horarios, servicios asignados, agenda propia, ausencias, comisiones (plan Business). ❌ estadísticas individuales fuera de la caja. |
| 14. Lista de espera | ❌ | |
| 15. Fidelización | ❌ | |
| 16. Estadísticas | 🟡 | ✅ inicio con turnos, ingresos cobrados reales (no estimados), ocupación, ausencias, más vendidos; caja con reporte CSV. ❌ horarios de mayor demanda, clientes nuevos vs recurrentes, cancelaciones. |
| 17. Gerencia VOLT | 🟡 | ✅ solo administradores de plataforma; negocios, pagos, planes, ajustes; suspender/reactivar. ❌ usuarios, módulos por plan, actividad, errores, soporte. |
| 18. Planes | 🟡 | ✅ Starter/Pro/Business editables desde Gerencia (precio, máx. profesionales); débito automático preparado (falta B2/B3). ❌ límites por módulo desde Gerencia. |
| 19. Seguridad | 🟡 | ✅ RLS en todas las tablas, funciones con permisos mínimos, validación en servidor de horarios/precios/cupos, secretos solo en el servidor, webhook que re-consulta a Mercado Pago. ❌ logs de auditoría, rate limiting general (hoy: máx. 3 reservas activas por teléfono). |

## Plan por prioridades

**Prioridad 1 — Estabilidad** (siguiente)
1. Resolver B1 (deploy). Sin esto nada de lo demás sirve.
2. Confirmación manual opcional de reservas (estado "pendiente").
3. Registro de auditoría (quién creó/canceló/movió/cobró).
4. Script de pruebas SQL repetible (reservas, cupos, pedidos, permisos entre negocios).

**Prioridad 2 — Conversión**
1. Página pública: horarios visibles, preguntas frecuentes, política de cancelación, mapa con "Cómo llegar" (Google Maps embebido sin clave; el mapa interactivo con marcador necesita clave de Google Maps).
2. Señas y pagos con Mercado Pago por negocio (necesita la app de Mercado Pago, ver sección 5).
3. Recordatorios automáticos (necesita elegir canal: email o WhatsApp Cloud API).

**Prioridad 3 — Expansión**
1. Pedidos completos: notas, pedido mínimo, retiro/envío con zonas y costo, estados del pedido, fotos.
2. Abonos y paquetes de clases con descuento automático.
3. Clases recurrentes y lista de espera.

**Prioridad 4 y 5** — Descubrir, fidelización, estadísticas avanzadas, monitoreo.

## Registro de cambios

- 06/11 — Módulos de reserva configurables por negocio (migración 0016) y rubros nuevos. El rubro ya no limita: solo sugiere qué módulos vienen activados.
- 06/11 — Pedidos con varios productos (0015). Clases con cupos y venta por unidad (0014).
- 05/11 — Prueba gratis de 15 días (0013).
