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

**Cliente favorito + descuento manual (HU-124)**  
El equipo de ventas puede marcar a un cliente como **favorito** (estrella en la lista y la ficha; filtro "Favoritos") y registrar un **descuento preferente manual** (porcentaje o monto fijo). Ambos son visibles y destacados en la lista y la ficha. El descuento es **informativo**: no dispara envíos automáticos a los canales del cliente (eso depende de plantillas Meta y se trata aparte). Respeta los permisos de ARI (se edita por el `PUT` de cliente, `OPERATIVE.ARI`).

**Calificación interna del cliente al cerrar la venta (HU-126)**  
Cuando se cierra una venta, el equipo de ventas puede calificar **internamente** al cliente (escala 1-5) para registrar la experiencia de forma consistente. **Disparador (decisión del PO): el deal entra en una etapa GANADA (`isFinalWon`)** — el mismo evento que cuenta como "venta realizada" en el Dashboard (HU-127). Al ganar un deal se ofrece calificar; es **opcional** y no bloquea el cierre. La calificación queda asociada al cliente (tabla `client_ratings`, una por deal), visible en su ficha como promedio + nº de calificaciones, y **disponible para un futuro promedio**. **No** es el CSAT (satisfacción del cliente hacia la empresa) — eso requiere encuestar al cliente por su canal y se trata en una HU aparte.

**Pipeline de ventas visual (Kanban)**  
Las oportunidades de venta avanzan por etapas configurables: Lead → Contactado → Negociación → Ganado → Facturado → Perdido. El equipo ve el estado de todas las ventas de un vistazo.

**Historial de ventas (HU-133)** — subsección `/ari/history`: lista los deals (ventas finalizadas y
en proceso) con su **etapa** y un estado derivado **Ganada/Perdida/En proceso** (venta finalizada =
etapa `isFinalWon`, HU-126, consistente con el Dashboard). Filtros por **etapa** y **fecha/rango**
(`from`/`to` sobre `createdAt`). Cada fila enlaza al pipeline. Respeta rol/sucursal (`getBranchFilter`
\+ RLS; OPERATIVE solo sus deals). Reutiliza `GET /v1/ari/deals` (filtros añadidos en HU-133).

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

**Ranking de proveedores con score Precio / Entrega / Calidad (HU-125)**  
Cada proveedor tiene un score en escala **0-10** con tres ejes y una fuente explícita por eje:

| Eje | De dónde sale | Fórmula |
|-----|---------------|---------|
| **Precio** | Objetivo, del histórico de compras recibidas | `10 / avgRatio`, donde `avgRatio` = promedio por producto de `precioProveedor / precioPromedioMercado` (capado a 0-10). Más barato → más alto. |
| **Entrega** | **Calificación manual** al recibir la OC | promedio de `delivery_rating` (1-5) × 2 |
| **Calidad** | **Calificación manual** al recibir la OC | promedio de `quality_rating` (1-5) × 2 |
| **General** | — | promedio de los ejes **con datos** |

Cuando una OC pasa a `received`, el equipo de compras **califica al proveedor** (Entrega y Calidad, 1-5). Esa calificación es la **fuente única** de esos dos ejes. Si un eje aún no tiene datos (sin calificaciones, o sin compras para el precio) se muestra **"sin datos"** en vez de un valor por defecto engañoso. El score se recalcula al instante al calificar y, además, a diario. Calificar es **opcional**: una OC recibida sin calificar no rompe el flujo (esos ejes quedan "sin datos"). El dato objetivo de entregas a tiempo se conserva como información, pero **no** alimenta el eje Entrega (eso lo hacen las calificaciones). El envío automático de la calificación a canales queda fuera de alcance.

**Órdenes de compra con flujo de aprobación**  
Las OC pasan por estados: Borrador (`draft`) → Pendiente de aprobación (`submitted`) → Aprobada (`approved`) → Enviada al proveedor (`sent`) → Recibida (`received`). Solo el Jefe de Compras puede aprobar. Esto elimina compras no autorizadas. (Vocabulario canónico unificado en HU-116.)

**Historial de compras (HU-133)** — subsección `/nira/history`: lista las OC realizadas y en proceso
con su **estado canónico**, con filtros por **estado** y **fecha/rango** (`from`/`to` sobre `createdAt`).
Cada fila enlaza al detalle de la OC. Respeta rol/sucursal (`getBranchFilter` + RLS). Reutiliza el
endpoint `GET /v1/nira/purchase-orders` (filtros añadidos en HU-133), sin endpoint nuevo. La contraparte
(proveedor), monto, etc. quedan como mejora futura de filtros.

**Comparador de cotizaciones**  
Antes de crear una OC, NIRA puede mostrar los precios históricos del mismo producto con distintos proveedores, recomendando el más conveniente.

**Proveedor preferido (HU-123)**  
Cada producto puede tener un proveedor **preferido**, y la empresa un preferido **global** de respaldo. NIRA lo prioriza: al comparar precios lo marca y lo lista primero, y al proponer una OC lo usa por defecto (queda registrado en las notas del borrador). Resolución: preferido del producto → preferido global del tenant → comportamiento actual. Se gestiona desde el detalle de producto (KIRA) y la página de Proveedores (NIRA). Es una recomendación: el agente puede proponer otro con justificación.

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

**Trazabilidad completa (HU-128)**  
Cada movimiento registra obligatoriamente **quién** (usuario), **cómo** (`type`: entrada/salida/ajuste) y **por qué** (`reason`/motivo: compra/venta/devolución/ajuste/traslado), con referencia al documento de origen (OC, deal). El motivo nunca queda vacío. `stock_movements` es **append-only** y el stock **nunca queda negativo**.

**Quién mueve el stock (auditoría HU-128):**

| Camino | `type` | `reason` | Referencia |
|--------|--------|----------|------------|
| KIRA manual (`POST /kira/stock/movements`) | entrada/salida/ajuste | el que elija el usuario (default `ajuste`) | — |
| NIRA recibe OC (`receivePurchaseOrder`) | entrada | `compra` | `purchase_order` |
| **ARI cierra venta** (deal ganado, **HU-128 nuevo**) | salida | `venta` | `deal` |
| Agente IA (`registrar_movimiento`) | entrada/salida/ajuste | `ajuste` | — |
| Carga masiva Excel | ajuste | `ajuste` | `bulk_upload` |

Antes, **ARI vendía sin descontar inventario** (hueco): ahora, al **ganar un deal**, se generan
salidas (motivo `venta`) por las líneas de la **cotización aceptada** vinculada, congelando el
precio de venta y el costo del momento. Si **falta stock**, el cierre de la venta se **bloquea**
(no se vende sin existencias). Si el deal ganado no tiene cotización itemizada, no hay impacto de
inventario (venta sin itemizar).

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

## Dashboard — KPIs unificados + series históricas
**No es un módulo de negocio independiente — agrega datos de todos los módulos activos**  
**Endpoints:** `GET /v1/dashboard/kpis` (puntual) · `GET /v1/dashboard/timeseries` (histórico, HU-127)

Hay **dos vistas** distintas en el menú izquierdo, con responsabilidades separadas (HU-132):
- **Inicio** (`/dashboard`): **lo accionable del día** — lo que requiere atención ahora. No muestra
  métricas ni tendencias (viven en el Dashboard); enlaza a `/analitica` para ellas.
- **Dashboard** (`/analitica`, HU-127): **gráficos de líneas** con tendencias + Top 10 — las métricas.

### Inicio — información accionable (HU-132)
El Inicio se reenfocó a **lo que requiere atención hoy** (decisión de producto), dejando las métricas
al Dashboard. Bloques (solo se piden los endpoints que el **rol/módulo** del usuario puede consultar —
nunca se llama uno que daría 403, así nada queda permanentemente vacío):

| Bloque | Fuente | Módulo |
|--------|--------|--------|
| Stock crítico | `GET /v1/kira/alerts` (→ `{ critical }`) | KIRA |
| Órdenes esperando aprobación | `GET /v1/nira/purchase-orders?status=submitted` | NIRA |
| Borradores sin enviar | `GET /v1/nira/purchase-orders?status=draft` | NIRA |
| Citas de hoy (agendadas/confirmadas) | `GET /v1/agenda/appointments?date=<hoy>` | AGENDA |
| Notificaciones sin leer | `GET /v1/notifications?isRead=false` | universal |

Cada bloque **enlaza a su sección** (acción directa, no solo información). **Visibilidad por rol:**
`TENANT_ADMIN/BRANCH_ADMIN` ven todos los módulos activos (transversales); `AREA_MANAGER/OPERATIVE`
ven **solo su módulo** (se usa `user.module`, ahora incluido en la respuesta de login) + notificaciones.
La sucursal la aplica cada endpoint (`getBranchFilter`/RLS): admin consolida, los demás su sucursal.

> **Diagnóstico previo (HU-132 FASE 1):** los bloques antiguos aparecían vacíos por **contratos
> frontend↔backend desalineados y endpoints mal direccionados**, no por RLS/BUG-006: "Stock crítico"
> pegaba a `/kira/alerts/stock` (404; el real es `/kira/alerts`) y leía `data` en vez de `critical`;
> "Top proveedores" leía `supplierName`/`overallScore` cuando la API devuelve `name`/`score.overallScore`
> (nombres en blanco); y los KPIs/listas NIRA-KIRA se pedían para **todos** los usuarios, devolviendo
> 403 a quienes no son de ese módulo — error que el `.catch(()=>[])` del cliente ocultaba como "vacío".
> El reenfoque se construyó sobre contratos verificados y endpoints accesibles por rol.

### Dashboard de tendencias (HU-127 + HU-129)
Apartado nuevo (`/analitica`) con gráficos de líneas (reutiliza el `LineChart` de VERA). Muestra
**4 líneas** (HU-129): **Compras realizadas** (OC recibidas), **Ventas realizadas** (deals ganados —
disparador HU-126), **Monto comprado** y **Monto vendido**. *(Las líneas "OC creadas" y "Cotizaciones
realizadas" se retiraron de la vista en HU-129; el rollup las sigue calculando, reversible sin migración.)*

**Filtros (HU-129):** date picker de **fecha específica o rango libre** (desde/hasta, admite un solo
día con `from=to`) + atajos (Hoy/7/30/90 días), y un control para **mostrar/ocultar gráficos** cuya
selección se **persiste por usuario** (localStorage `nexor-dashboard-charts:<userId>`) y se restaura
en la siguiente visita.

Los datos salen de un **rollup diario** (job programado
[dashboard-rollup.ts](./apps/api/src/jobs/dashboard-rollup.ts) → tabla `dashboard_daily_rollups`),
así las consultas pesadas no corren en cada carga. Respeta el rol vía `getBranchFilter`
(TENANT_ADMIN consolidado; BRANCH_ADMIN su sucursal) y valida el rango. **No** incluye satisfacción
del cliente ni inventario crítico (fuera de alcance).

### Top 10 de productos (HU-130)
Gráfico de **barras** (ranking, no líneas) con dos vistas seleccionables:
- **Más vendidos** — suma de **unidades** salidas con motivo `venta`.
- **Mayor ganancia** — suma de **(precio de venta − precio de costo) × unidades**, con los precios
  **congelados** en cada `stock_movement` del momento de la venta (HU-128), nunca con los precios
  actuales del producto.

No siempre coinciden (el que más unidades mueve no es el que más deja). El dato sale **directo de
`stock_movements`** (solo salidas con motivo `venta`; gracias a la trazabilidad de HU-128) vía
`GET /v1/dashboard/top-products` — agregado por producto en una sola consulta, sin tabla de rollup
nueva. Respeta el mismo filtro de fechas y el rol del Dashboard. Si no hay ventas en el rango,
muestra un estado vacío claro.

### KPIs puntuales — `GET /v1/dashboard/kpis`
Consolida los KPIs más importantes de todos los módulos activos del tenant en una sola llamada.
*(Desde HU-132 el **Inicio ya no consume** este endpoint — las métricas viven en el Dashboard
`/analitica`; el endpoint sigue disponible para consumidores que lo necesiten.)*

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

## INBOX — Bandeja unificada
**No es un módulo de negocio independiente — es la bandeja de conversaciones del equipo**  
**Roles que lo usan:** AREA_MANAGER y superiores

### Qué hace
Bandeja unificada de conversaciones de WhatsApp y Gmail. Agrupa los mensajes por remitente y canal en un solo lugar.

El agente de IA responde automáticamente, pero el equipo humano puede **tomar el control** de una conversación: responder manualmente, cambiar su estado y reasignarla a otra persona.

**Estados de conversación:** `open` → `replied` → `resolved` → `reassigned`.

### Acceso
Disponible para el rol AREA_MANAGER en adelante.

---

## OCR — Extracción de documentos
**No es un módulo de negocio independiente — alimenta borradores en NIRA/ARI**  
**Roles que lo usan:** AREA_MANAGER y superiores

### Qué hace
Extracción de datos de documentos (facturas, cotizaciones, órdenes) a partir de imagen o PDF, usando Claude con visión.

Los datos extraídos alimentan **borradores** en NIRA y ARI, evitando la captura manual.

### Acceso
Disponible para el rol AREA_MANAGER en adelante.

---

## BULK-UPLOAD — Carga masiva
**No es un módulo de negocio independiente — herramienta de importación**  
**Roles que lo usan:** TENANT_ADMIN

### Qué hace
Importación masiva de datos por Excel, con **validación y preview antes de procesar** la carga.

Incluye plantillas por tipo de dato e historial de cargas realizadas.

### Acceso
Disponible para el rol TENANT_ADMIN (el cliente sube sus propios archivos en `/settings/bulk-upload`).

### Supervisión de plataforma (HU-140)
El equipo NEXOR ve las cargas de **todos los clientes** (tenant, tipo, estado, fecha) desde la
**consola de plataforma**: **Supervisión** (`/platform/supervision` → `GET /v1/admin/bulk-upload/logs`).
Es **solo de plataforma** (`platform_admins`; guard `superAdminHook`) — ningún cliente ve la de otros,
y no expone datos de negocio más allá del registro de carga. La antigua pantalla de supervisión dentro
del panel de cliente (`/admin/bulk-uploads`) se **retiró**: hay una sola supervisión, en la plataforma.
El equipo NEXOR **no** recibe notificaciones in-app de cargas (supervisa por esta pantalla, no por push).

---

## CHAT — Asistente interno
**No es un módulo de negocio independiente — chat del dashboard**  
**Roles que lo usan:** los empleados del tenant

### Qué hace
Chat dentro del dashboard donde los empleados conversan con los agentes de IA.

El historial se persiste en la tabla `chat_messages` y se enruta por módulo.

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
