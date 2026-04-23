# README_MODULES — Módulos de NEXOR V1

> Cada módulo tiene un agente de IA con nombre, personalidad y herramientas propias. Este documento describe qué hace cada módulo, qué problema resuelve, cómo interactúa con los demás, y qué feature flag lo controla.

---

## Mapa de interacciones entre módulos

```
WhatsApp / Gmail
      ↓
   AgentRunner
   ┌────────────────────────────────────────┐
   │  ARI (Ventas)  ←──────────────────────┤ Consulta stock disponible
   │       ↓ Venta cerrada                 │
   │  VERA (Finanzas) ← ingreso automático │
   │                                        │
   │  NIRA (Compras) ─────────────────────►│ OC aprobada genera entrada en KIRA
   │       ↓ OC aprobada                   │
   │  VERA (Finanzas) ← egreso automático  │
   │                                        │
   │  KIRA (Inventario) ──────────────────►│ Stock bajo mínimo alerta a NIRA
   │                                        │
   │  AGENDA (Citas) ──────────────────────┤ Independiente, notifica a ARI
   └────────────────────────────────────────┘
```

---

## ARI — Ventas y CRM
**Agente:** ARI · Personalidad: persuasiva y enfocada  
**Feature flag:** `ARI`  
**Roles que lo usan:** Jefe de Ventas (AREA_MANAGER), Vendedor (OPERATIVE)

### Qué problema resuelve
Sin NEXOR, las empresas gestionan sus clientes en Excel, WhatsApp personal y cuadernos. Se pierden leads, las cotizaciones se olvidan, y nadie sabe en qué punto del proceso está cada cliente.

### Qué hace ARI

**CRM inteligente**  
Centraliza toda la información de clientes: datos de contacto, historial de interacciones, cotizaciones enviadas y deals activos. Un vendedor puede ver en 10 segundos todo lo que ha pasado con un cliente.

**Pipeline de ventas visual (Kanban)**  
Las oportunidades de venta avanzan por etapas configurables: Lead → Contactado → Negociación → Ganado → Facturado → Perdido. El equipo ve el estado de todas las ventas de un vistazo.

**Cotizaciones automáticas**  
ARI genera cotizaciones numeradas con productos del catálogo, precios, descuentos y fecha de validez. Cuando el cliente acepta, la venta pasa a VERA automáticamente como ingreso.

**Integración con WhatsApp y email**  
Cuando un cliente escribe "quiero comprar X" por WhatsApp, el agente ARI crea el lead, registra la interacción y notifica al vendedor — todo sin que el vendedor haya hecho nada.

**Visibilidad de stock**  
Antes de cotizar, ARI puede consultar el stock disponible en KIRA — incluyendo otras sucursales — para no prometer algo que no existe.

### Flujos clave

**Flujo 1: Lead entrante por WhatsApp**
```
Cliente escribe → Agente identifica intención de compra
→ Busca si el cliente ya existe (por número de teléfono)
→ Si no existe: crea cliente + deal en etapa "Lead"
→ Notifica al vendedor responsable
→ Responde al cliente con mensaje de confirmación
```

**Flujo 2: Cierre de venta**
```
Vendedor mueve deal a etapa "Ganado"
→ ARI genera cotización si no existe
→ Cotización cambia a "accepted"
→ VERA registra ingreso automáticamente
→ Se genera notificación al Jefe de Ventas
```

### Interacciones con otros módulos
- **→ KIRA:** Consulta stock antes de cotizar (`GET /v1/kira/stock/cross-branch/:productId`)
- **→ VERA:** Cuando una cotización es aceptada, genera transaction de ingreso
- **← AGENDA:** Si el agente detecta intención de agendar, deriva al módulo de agenda

---

## NIRA — Compras y Proveedores
**Agente:** NIRA · Personalidad: analítica y metódica  
**Feature flag:** `NIRA`  
**Roles que lo usan:** Jefe de Compras (AREA_MANAGER), Comprador (OPERATIVE)

### Qué problema resuelve
Las empresas compran a múltiples proveedores sin saber cuál tiene mejor precio histórico, cuál entrega a tiempo, ni cuánto han gastado en el mes. Las órdenes de compra se hacen por WhatsApp y nadie tiene registro.

### Qué hace NIRA

**Gestión de proveedores con scoring automático**  
Cada proveedor tiene una ficha técnica y un score calculado diariamente con tres variables: precio histórico (comparado contra el promedio del mercado), cumplimiento de entrega (llegó a tiempo vs. se atrasó), y calidad (devoluciones o reclamos). Esto permite comparar proveedores objetivamente.

**Órdenes de compra con flujo de aprobación**  
Las OC pasan por estados: Borrador → Pendiente de aprobación → Aprobada → Enviada al proveedor → Recibida. Solo el Jefe de Compras puede aprobar. Esto elimina compras no autorizadas.

**Comparador de cotizaciones**  
Antes de crear una OC, NIRA puede mostrar los precios históricos del mismo producto con distintos proveedores, recomendando el más conveniente.

**Integración automática con KIRA**  
Cuando una OC es marcada como recibida, NIRA genera automáticamente una entrada de stock en KIRA por cada ítem recibido. No hay que registrar la entrada dos veces.

**Alertas de reabastecimiento**  
Cuando KIRA detecta que un producto está bajo el mínimo, crea una alerta y puede disparar una solicitud de compra en NIRA automáticamente.

### Flujos clave

**Flujo 1: Reabastecimiento automático**
```
KIRA detecta producto bajo mínimo
→ Genera notificación al Jefe de Compras
→ Opcionalmente crea borrador de OC con el proveedor de mejor score
→ Comprador revisa y envía a aprobación
→ Jefe aprueba
→ OC enviada al proveedor
```

**Flujo 2: Recepción de mercancía**
```
Mercancía llega a la sucursal
→ Comprador registra quantities recibidas en la OC
→ NIRA genera stock_movement de entrada en KIRA
→ Stock actualizado automáticamente
→ VERA registra egreso por el total de la OC
```

### Interacciones con otros módulos
- **← KIRA:** Recibe alertas de stock bajo mínimo
- **→ KIRA:** Genera entradas de stock al recibir mercancía
- **→ VERA:** Genera egreso cuando se aprueba una OC

---

## KIRA — Inventario
**Agente:** KIRA · Personalidad: estructurada y meticulosa  
**Feature flag:** `KIRA`  
**Roles que lo usan:** Jefe de Bodega (AREA_MANAGER), Bodeguero (OPERATIVE)

### Qué problema resuelve
Las empresas no saben exactamente cuánto tienen en stock en tiempo real, quién movió qué, ni por qué hay diferencias entre lo que dice el sistema y lo que hay físicamente.

### Qué hace KIRA

**Control de stock en tiempo real por sucursal**  
Cada producto tiene su stock registrado por sucursal. Los movimientos (entradas, salidas, ajustes) se registran con responsable, fecha y referencia al documento que los originó.

**Visibilidad cruzada entre sucursales**  
Un vendedor de la Sede Norte puede ver que en la Sede Sur hay stock disponible del producto que le está pidiendo el cliente. Esto permite redirigir ventas sin perderlas.

**Clasificación ABC automática**  
KIRA calcula semanalmente qué productos generan el 80% del valor del inventario (clase A), cuáles el siguiente 15% (clase B), y cuáles el 5% restante (clase C). Esto permite priorizar esfuerzos de compra y almacenamiento.

**Trazabilidad completa**  
Cada movimiento registra: quién lo hizo, cuándo, desde qué documento (OC, venta, ajuste manual), número de lote y fecha de caducidad. Es posible rastrear cualquier unidad desde que entró hasta que salió.

**Alertas automáticas**  
Un job de BullMQ revisa cada hora si algún producto está bajo su mínimo de stock y genera notificaciones para el equipo de bodega y compras.

**Prevención de pérdidas**  
KIRA detecta anomalías como: movimientos grandes sin justificación, productos que desaparecen sin salida registrada, o diferencias recurrentes en los conteos cíclicos.

### Flujos clave

**Flujo 1: Alerta de stock crítico**
```
Worker revisa stocks cada hora
→ Encuentra producto con quantity < min_stock
→ Crea notification para Jefe de Bodega y Jefe de Compras
→ Opcionalmente crea solicitud en NIRA
```

**Flujo 2: Conteo cíclico**
```
Jefe de Bodega programa conteo de un grupo de productos
→ Bodegueros registran cantidades físicas contadas
→ KIRA compara contra el stock del sistema
→ Muestra diferencias
→ Jefe aprueba ajustes
→ Se generan stock_movements de tipo "ajuste"
```

### Interacciones con otros módulos
- **← NIRA:** Recibe entradas de stock cuando llega una OC
- **← ARI:** ARI consulta disponibilidad antes de cotizar
- **→ NIRA:** Envía alertas de reabastecimiento
- **→ VERA:** No directamente — VERA recibe las transacciones de ARI y NIRA, no de KIRA

---

## AGENDA — Agendamiento de citas
**Agente:** Agente Agenda · Personalidad: amable y eficiente  
**Feature flag:** `AGENDA`  
**Roles que lo usan:** Jefe de Agenda (AREA_MANAGER), Recepcionista (OPERATIVE)

### Qué problema resuelve
Las empresas con citas (médicos, peluquerías, talleres, consultorios) gestionan su agenda en papel o en aplicaciones separadas. Cuando un cliente escribe por WhatsApp para agendar, hay que buscar disponibilidad manualmente y responder manualmente.

### Qué hace AGENDA

**Calendario por sucursal y profesional**  
Cada sucursal configura sus horarios de disponibilidad por día de la semana. Las citas se asignan evitando conflictos de horario automáticamente.

**Agendamiento por WhatsApp sin intervención humana**  
El agente interpreta mensajes como "quiero agendar una cita para el martes en la tarde", consulta los horarios disponibles, propone opciones al cliente, y crea la cita cuando el cliente confirma.

**Confirmaciones y recordatorios automáticos**  
Al crear una cita se envía confirmación por email o WhatsApp. Un job de BullMQ envía recordatorio 24 horas antes de la cita.

**Tipos de servicio configurables**  
Cada empresa configura sus servicios: nombre, duración y precio. Una cita de "Consulta médica" puede durar 30 minutos, mientras que una "Revisión técnica de vehículo" dura 2 horas.

### Flujo clave: Agendamiento por WhatsApp

```
Cliente escribe: "Quiero agendar una cita para el viernes"
→ Agente consulta: ver_horarios_disponibles(branchId, date: 'viernes')
→ Agente responde: "Tengo disponible a las 9:00, 11:30 y 3:00. ¿Cuál prefieres?"
→ Cliente responde: "A las 11:30"
→ Agente ejecuta: crear_cita(clientName, phone, startAt, branchId)
→ Confirmación enviada al cliente por WhatsApp
→ Notificación in-app a la recepcionista
```

### Interacciones con otros módulos
- **→ ARI:** Si el cliente que agenda no existe en el CRM, se puede crear como lead en ARI (integración futura)
- Agenda es el módulo más independiente — puede funcionar sin los demás

---

## VERA — Finanzas
**Agente:** VERA · Personalidad: precisa y estratégica  
**Feature flag:** `VERA`  
**Roles que lo usan:** Jefe de Finanzas (AREA_MANAGER), Contador (OPERATIVE — solo lectura)

### Qué problema resuelve
Las empresas no tienen visibilidad financiera en tiempo real. Los ingresos de ventas y los egresos de compras se registran manualmente en contabilidad días después, haciendo imposible tomar decisiones con datos actuales.

### Qué hace VERA

**Registro automático de ingresos y egresos**  
VERA no requiere entrada manual de datos. Los ingresos llegan automáticamente de ARI cuando se cierra una venta. Los egresos llegan de NIRA cuando se aprueba una OC. VERA consolida todo.

**Dashboard financiero ejecutivo**  
El dueño o gerente puede ver en tiempo real: ingresos vs. egresos del mes, balance neto, comparativo por sucursal, y tendencia mensual.

**Gestión de presupuestos**  
Se pueden definir límites de gasto por área o proyecto. NIRA verifica el presupuesto disponible antes de aprobar una OC y alerta cuando se está llegando al límite.

**Reportes contables básicos**  
VERA genera: estado de resultados por período, flujo de caja, y análisis de rentabilidad por línea de negocio o cliente. Suficiente para la dirección de la empresa en V1.

### Flujos clave

**Flujo 1: Ingreso automático por venta**
```
ARI: cotización cambia a "accepted"
→ ARI llama: crear_transaccion({ type: 'income', amount, referenceType: 'quote', referenceId })
→ VERA registra transaction
→ Dashboard actualizado en tiempo real
```

**Flujo 2: Egreso automático por compra**
```
NIRA: OC aprobada
→ NIRA llama: crear_transaccion({ type: 'expense', amount, referenceType: 'purchase_order', referenceId })
→ VERA registra transaction
→ Verifica contra presupuesto del área
```

### Interacciones con otros módulos
- **← ARI:** Recibe ingresos cuando se cierran ventas
- **← NIRA:** Recibe egresos cuando se aprueban OCs
- VERA es consumidor — no genera datos hacia otros módulos

---

## Dashboard — KPIs unificados
**No es un módulo de negocio independiente — agrega datos de todos los módulos activos**  
**Endpoint:** `GET /v1/dashboard/kpis`

### Qué hace
Consolida los KPIs más importantes de todos los módulos activos del tenant en una sola llamada, para que el dashboard ejecutivo del frontend pueda cargarse con una sola request.

### KPIs por módulo

| Módulo | KPIs |
|--------|------|
| KIRA | `productos_stock_critico`, `movimientos_hoy`, `valor_inventario_total` |
| NIRA | `oc_pendientes_aprobacion`, `oc_entrega_vencida`, `total_gastado_mes` |
| ARI | `leads_nuevos_hoy`, `deals_en_negociacion`, `valor_pipeline_total` |
| AGENDA | `citas_hoy`, `proxima_cita`, `tasa_asistencia_mes` |
| VERA | `ingresos_mes`, `egresos_mes`, `utilidad_bruta`, `porcentaje_presupuesto` |

### Reglas de resiliencia
- Cada módulo corre en paralelo con `Promise.allSettled` y un timeout de 800 ms.
- Si un módulo falla, devuelve `{ data: null, error: "..." }` sin afectar los demás.
- El endpoint **nunca devuelve 500** — siempre responde 200 aunque todos los módulos fallen.
- OPERATIVE y AREA_MANAGER solo reciben KPIs del módulo que tienen asignado.

---

## Super Admin — Panel de plataforma
**No es un módulo de negocio — es la vista del equipo NEXOR**  
**Rol requerido:** `SUPER_ADMIN`

### Qué hace

Permite al equipo de NEXOR operar la plataforma:

- Ver todos los tenants registrados con su estado (activo/inactivo)
- Activar o desactivar un tenant
- Impersonar un tenant para dar soporte técnico (queda en audit log)
- Ver métricas globales de uso de la plataforma
- Gestionar feature flags de cualquier tenant

### Regla de oro
Toda acción del Super Admin — especialmente la impersonación — queda registrada en la tabla `agent_logs` con el userId del Super Admin, la IP, el timestamp y la acción realizada. Esto es innegociable.

---

## Tabla resumen de módulos

| Módulo | Agente IA | Feature flag | Lee de | Escribe en | Genera en VERA |
|--------|-----------|--------------|--------|------------|----------------|
| ARI | ARI | `ARI` | KIRA (stock) | clients, deals, quotes, interactions | Sí — ingresos |
| NIRA | NIRA | `NIRA` | KIRA (alertas) | suppliers, purchase_orders | Sí — egresos |
| KIRA | KIRA | `KIRA` | — | products, stocks, stock_movements, lots | No |
| AGENDA | Agenda | `AGENDA` | — | service_types, availability, appointments | No |
| VERA | — | `VERA` | ARI, NIRA | transactions, categories, cost_centers, budgets | — |
| Dashboard | — | Todos | ARI, NIRA, KIRA, AGENDA, VERA | — | — |
| Super Admin | — | — (SUPER_ADMIN) | Todos los tenants | — | — |
