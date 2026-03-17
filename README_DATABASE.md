# README_DATABASE — Arquitectura de Base de Datos NEXOR V1

> **Versión:** V1 Final  
> **Motor:** PostgreSQL  
> **ORM:** Prisma  
> **Patrón multi-tenancy:** Base de datos compartida con `tenant_id` en cada tabla + Row-Level Security (RLS)

---

## Principio fundamental

Todos los datos de todos los clientes (tenants) viven en la misma base de datos. Lo que los separa es el campo `tenant_id` presente en **cada tabla de negocio con relación directa al tenant**. PostgreSQL enforcea este aislamiento a nivel de base de datos mediante Row-Level Security (RLS), lo que significa que aunque un bug de código intente acceder a datos de otro tenant, la DB lo rechaza.

**Regla general:** Toda tabla de negocio con relación directa al tenant debe tener `tenant_id` y su política RLS correspondiente.

**Excepción — tablas hijas:** Las tablas de detalle que solo existen como hijas de una tabla con `tenant_id` no necesitan repetirlo. Su aislamiento se hereda por FK del padre. Estas tablas son:

| Tabla hija | Tabla padre (tiene tenant_id) |
|------------|-------------------------------|
| `stocks` | `products` + `branches` |
| `quote_items` | `quotes` |
| `purchase_order_items` | `purchase_orders` |
| `supplier_scores` | `suppliers` |

Estas 4 tablas no tienen RLS propio — nunca se consultan de forma independiente sin pasar primero por la tabla padre, que ya está filtrada por tenant.

---

## Diagrama de relaciones

```
Tenant (1)
  ├── Branch (N)           → sucursales de la empresa
  ├── User (N)             → usuarios de todos los roles
  ├── FeatureFlag (N)      → módulos activos por tenant
  ├── Integration (N)      → WhatsApp/Gmail conectados
  ├── AgentLog (N)         → historial de acciones de la IA
  ├── Notification (N)     → notificaciones in-app
  │
  ├── [ARI] Client (N)
  │     ├── Interaction (N)
  │     ├── Quote (N)
  │     │     └── QuoteItem (N) → Product
  │     └── PipelineDeal (N)
  │
  ├── [NIRA] Supplier (N)
  │     ├── PurchaseOrder (N)
  │     │     └── PurchaseOrderItem (N) → Product
  │     └── SupplierScore (1)
  │
  ├── [KIRA] Product (N)
  │     ├── Stock (N)       → Branch
  │     └── StockMovement (N) → Branch, User
  │
  ├── [AGENDA] Appointment (N) → Branch, User (profesional)
  │
  └── [VERA] Transaction (N)   → generada por ARI y NIRA
```

---

## Tablas — Especificación completa

### CORE (compartidas por todos los módulos)

---

#### `tenants`

Representa a cada empresa cliente que usa NEXOR. Es el nodo raíz de toda la jerarquía de datos.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID generado automáticamente |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre comercial de la empresa |
| `slug` | `VARCHAR(100)` | UNIQUE, NOT NULL | Identificador único para URLs (ej: `farmacia-lopez`) |
| `legal_name` | `VARCHAR(255)` | NULL | Nombre legal / razón social |
| `tax_id` | `VARCHAR(50)` | NULL | NIT / RUT / identificación fiscal |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el tenant puede acceder al sistema |
| `timezone` | `VARCHAR(50)` | NOT NULL, DEFAULT 'America/Bogota' | Zona horaria para fechas y reportes |
| `currency` | `VARCHAR(3)` | NOT NULL, DEFAULT 'COP' | Moneda local (ISO 4217) |
| `logo_url` | `VARCHAR(500)` | NULL | URL del logo para cotizaciones |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `slug` (UNIQUE)  
**Notas:** Esta tabla NO tiene `tenant_id` — es la raíz. RLS no aplica aquí. Solo el Super Admin puede leer todos los registros.

---

#### `branches`

Sucursales de cada empresa. El inventario, los usuarios operativos y las integraciones de WhatsApp/Gmail se asignan por sucursal.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa a la que pertenece |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre de la sucursal (ej: "Sede Norte") |
| `city` | `VARCHAR(100)` | NULL | Ciudad |
| `address` | `VARCHAR(500)` | NULL | Dirección completa |
| `phone` | `VARCHAR(20)` | NULL | Teléfono de contacto de la sucursal |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si la sucursal está operativa |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id)`, `(tenant_id, is_active)`  
**RLS:** Solo usuarios del mismo `tenant_id` pueden ver estas filas.

---

#### `users`

Todos los usuarios del sistema, de todos los roles y tenants.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa a la que pertenece |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal asignada (NULL = acceso a todas) |
| `email` | `VARCHAR(255)` | UNIQUE, NOT NULL | Email (usado para login) |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre completo |
| `password_hash` | `VARCHAR(255)` | NOT NULL | Hash bcrypt de la contraseña |
| `role` | `ENUM` | NOT NULL | Ver enum `Role` abajo |
| `module` | `ENUM` | NULL | Módulo principal (solo para AREA_MANAGER y OPERATIVE) |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el usuario puede iniciar sesión |
| `last_login_at` | `TIMESTAMPTZ` | NULL | Último acceso al sistema |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(email)` UNIQUE, `(tenant_id)`, `(tenant_id, role)`, `(branch_id)`  
**Enum `Role`:** `SUPER_ADMIN | TENANT_ADMIN | BRANCH_ADMIN | AREA_MANAGER | OPERATIVE`  
**Enum `Module`:** `ARI | NIRA | KIRA | AGENDA | VERA`  
**RLS:** Solo usuarios del mismo `tenant_id`. SUPER_ADMIN ve todos.

---

#### `feature_flags`

Controla qué módulos están activos para cada tenant. Permite activar/desactivar funcionalidades sin tocar código.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `module` | `ENUM(Module)` | NOT NULL | Módulo (ARI, NIRA, KIRA, AGENDA, VERA) |
| `enabled` | `BOOLEAN` | NOT NULL, DEFAULT false | Si el módulo está activo |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `UNIQUE(tenant_id, module)`  
**Notas:** Se crea un registro por cada módulo al crear el tenant. El onboarding activa los módulos contratados.

---

#### `integrations`

Tokens y configuración de las integraciones externas (WhatsApp Business, Gmail) por tenant y sucursal.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal (NULL = aplica a toda la empresa) |
| `channel` | `ENUM` | NOT NULL | `WHATSAPP` o `GMAIL` |
| `identifier` | `VARCHAR(255)` | NOT NULL | Número de WA o email según canal |
| `token_encrypted` | `TEXT` | NULL | Token de acceso cifrado con AES-256 |
| `metadata` | `JSONB` | NULL | Datos adicionales del canal (phone_number_id, etc.) |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT false | Si la integración está conectada |
| `last_verified_at` | `TIMESTAMPTZ` | NULL | Última verificación exitosa del token |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id)`, `(channel, identifier)` — este último es el que usa el webhook para identificar el tenant  
**Seguridad:** `token_encrypted` NUNCA se devuelve en responses de la API. Solo se usa internamente.

---

#### `agent_logs`

Registro inmutable de cada acción tomada por cualquier agente de IA. Obligatorio para auditoría y mejora del modelo.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `module` | `ENUM(Module)` | NOT NULL | Qué agente actuó (ARI, NIRA, KIRA, AGENDA) |
| `channel` | `VARCHAR(50)` | NOT NULL | Canal de entrada (whatsapp, gmail, internal) |
| `input_message` | `TEXT` | NOT NULL | Mensaje original recibido |
| `reply` | `TEXT` | NULL | Respuesta enviada al usuario |
| `tools_used` | `VARCHAR[]` | NOT NULL, DEFAULT '{}' | Array con nombres de las tools ejecutadas |
| `tool_details` | `JSONB` | NOT NULL | Detalle de cada tool: input, output, timestamp |
| `turn_count` | `INTEGER` | NOT NULL, DEFAULT 1 | Número de turnos del bucle tool use |
| `duration_ms` | `INTEGER` | NULL | Tiempo total de procesamiento en ms |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Timestamp de la interacción |

**Índices:** `(tenant_id)`, `(tenant_id, module)`, `(created_at DESC)`  
**Notas:** Esta tabla es APPEND-ONLY. Nunca se actualiza ni se elimina un registro.

---

#### `notifications`

Notificaciones in-app por usuario. Generadas por el sistema, los jobs y los agentes de IA.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `user_id` | `VARCHAR(30)` | FK → users.id, NOT NULL | Usuario destinatario |
| `module` | `ENUM(Module)` | NULL | Módulo que generó la notificación |
| `type` | `VARCHAR(50)` | NOT NULL | Tipo (stock_alert, new_lead, appointment, etc.) |
| `title` | `VARCHAR(255)` | NOT NULL | Título corto de la notificación |
| `message` | `TEXT` | NOT NULL | Descripción completa |
| `link` | `VARCHAR(500)` | NULL | URL interna de acción (ej: /kira/products/123) |
| `is_read` | `BOOLEAN` | NOT NULL, DEFAULT false | Si el usuario ya la leyó |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo fue generada |

**Índices:** `(tenant_id, user_id, is_read)`, `(created_at DESC)`

---

### MÓDULO ARI — Ventas y CRM

---

#### `clients`

Clientes y prospectos de la empresa. Un cliente puede existir aunque nunca haya comprado (lead).

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre completo o razón social |
| `email` | `VARCHAR(255)` | NULL | Email de contacto |
| `phone` | `VARCHAR(20)` | NULL | Teléfono (puede ser el número de WhatsApp) |
| `whatsapp_id` | `VARCHAR(50)` | NULL | ID de WhatsApp para identificar mensajes entrantes |
| `company` | `VARCHAR(255)` | NULL | Empresa del cliente (si es B2B) |
| `tax_id` | `VARCHAR(50)` | NULL | NIT/cédula del cliente |
| `address` | `VARCHAR(500)` | NULL | Dirección |
| `city` | `VARCHAR(100)` | NULL | Ciudad |
| `source` | `VARCHAR(50)` | NULL | Origen: whatsapp, email, manual, referido |
| `tags` | `VARCHAR[]` | NOT NULL, DEFAULT '{}' | Etiquetas libres |
| `notes` | `TEXT` | NULL | Notas internas sobre el cliente |
| `assigned_to` | `VARCHAR(30)` | FK → users.id, NULL | Vendedor asignado |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal que lo atiende |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el cliente está activo |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id)`, `(tenant_id, assigned_to)`, `(whatsapp_id)`, `(tenant_id, is_active)`

---

#### `pipeline_stages`

Etapas configurables del embudo de ventas por tenant. Por defecto: Lead → Contactado → Negociación → Ganado → Facturado → Perdido.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `name` | `VARCHAR(100)` | NOT NULL | Nombre de la etapa |
| `order` | `INTEGER` | NOT NULL | Orden en el kanban (1, 2, 3...) |
| `color` | `VARCHAR(7)` | NULL | Color hex para el kanban |
| `is_final_won` | `BOOLEAN` | NOT NULL, DEFAULT false | Indica que el deal fue ganado |
| `is_final_lost` | `BOOLEAN` | NOT NULL, DEFAULT false | Indica que el deal fue perdido |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |

**Índices:** `(tenant_id, order)`

---

#### `deals`

Oportunidades de venta en el pipeline. Cada deal representa una negociación con un cliente.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `client_id` | `VARCHAR(30)` | FK → clients.id, NOT NULL | Cliente asociado |
| `stage_id` | `VARCHAR(30)` | FK → pipeline_stages.id, NOT NULL | Etapa actual del pipeline |
| `assigned_to` | `VARCHAR(30)` | FK → users.id, NULL | Vendedor responsable |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal |
| `title` | `VARCHAR(255)` | NOT NULL | Título del deal (ej: "Pedido 20 shampoo") |
| `value` | `DECIMAL(15,2)` | NULL | Valor estimado de la venta |
| `probability` | `INTEGER` | NULL, CHECK(0-100) | Probabilidad de cierre en % |
| `expected_close` | `DATE` | NULL | Fecha esperada de cierre |
| `lost_reason` | `TEXT` | NULL | Razón de pérdida (si aplica) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |
| `closed_at` | `TIMESTAMPTZ` | NULL | Cuándo se cerró (ganado o perdido) |

**Índices:** `(tenant_id, stage_id)`, `(tenant_id, assigned_to)`, `(client_id)`

---

#### `interactions`

Historial de comunicaciones con cada cliente (mensajes WhatsApp, emails, llamadas, notas).

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `client_id` | `VARCHAR(30)` | FK → clients.id, NOT NULL | Cliente |
| `deal_id` | `VARCHAR(30)` | FK → deals.id, NULL | Deal asociado (opcional) |
| `user_id` | `VARCHAR(30)` | FK → users.id, NULL | Usuario que registró (NULL = agente IA) |
| `type` | `VARCHAR(50)` | NOT NULL | whatsapp, email, call, note, meeting |
| `direction` | `VARCHAR(10)` | NOT NULL | inbound / outbound |
| `content` | `TEXT` | NOT NULL | Contenido del mensaje o nota |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo ocurrió |

**Índices:** `(tenant_id, client_id)`, `(created_at DESC)`

---

#### `quotes`

Cotizaciones generadas para los clientes.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `client_id` | `VARCHAR(30)` | FK → clients.id, NOT NULL | Cliente |
| `deal_id` | `VARCHAR(30)` | FK → deals.id, NULL | Deal asociado |
| `created_by` | `VARCHAR(30)` | FK → users.id, NOT NULL | Quien la creó |
| `quote_number` | `VARCHAR(50)` | NOT NULL | Número de cotización (COT-2024-001) |
| `status` | `VARCHAR(30)` | NOT NULL, DEFAULT 'draft' | draft, sent, accepted, rejected, expired |
| `subtotal` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Subtotal sin impuestos |
| `discount` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Descuento total |
| `tax` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Impuestos |
| `total` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Total final |
| `valid_until` | `DATE` | NULL | Fecha de validez |
| `notes` | `TEXT` | NULL | Notas adicionales para el cliente |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id, client_id)`, `(tenant_id, status)`, `UNIQUE(tenant_id, quote_number)`

---

#### `quote_items`

Líneas de cada cotización. Referencia al catálogo de productos al momento de crearla.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `quote_id` | `VARCHAR(30)` | FK → quotes.id, NOT NULL | Cotización |
| `product_id` | `VARCHAR(30)` | FK → products.id, NULL | Producto del catálogo (NULL si es libre) |
| `description` | `VARCHAR(500)` | NOT NULL | Descripción del ítem |
| `quantity` | `DECIMAL(10,2)` | NOT NULL | Cantidad |
| `unit_price` | `DECIMAL(15,2)` | NOT NULL | Precio unitario al momento de cotizar |
| `discount_pct` | `DECIMAL(5,2)` | NOT NULL, DEFAULT 0 | Descuento en % |
| `total` | `DECIMAL(15,2)` | NOT NULL | Total de la línea |

**Índices:** `(quote_id)`

---

### MÓDULO NIRA — Compras

---

#### `suppliers`

Proveedores de la empresa.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre del proveedor |
| `contact_name` | `VARCHAR(255)` | NULL | Nombre del contacto |
| `email` | `VARCHAR(255)` | NULL | Email |
| `phone` | `VARCHAR(20)` | NULL | Teléfono |
| `tax_id` | `VARCHAR(50)` | NULL | NIT del proveedor |
| `address` | `VARCHAR(500)` | NULL | Dirección |
| `city` | `VARCHAR(100)` | NULL | Ciudad |
| `payment_terms` | `INTEGER` | NULL | Días de crédito (ej: 30, 60, 90) |
| `notes` | `TEXT` | NULL | Notas internas |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el proveedor está activo |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id)`, `(tenant_id, is_active)`

---

#### `supplier_scores`

Puntuación calculada automáticamente para cada proveedor. Se recalcula diariamente con un job de BullMQ.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `supplier_id` | `VARCHAR(30)` | FK → suppliers.id, UNIQUE, NOT NULL | Proveedor (1 a 1) |
| `price_score` | `DECIMAL(4,2)` | NOT NULL, DEFAULT 0 | Score de precio (0-10) |
| `delivery_score` | `DECIMAL(4,2)` | NOT NULL, DEFAULT 0 | Score de cumplimiento en tiempo (0-10) |
| `quality_score` | `DECIMAL(4,2)` | NOT NULL, DEFAULT 0 | Score de calidad (0-10) |
| `overall_score` | `DECIMAL(4,2)` | NOT NULL, DEFAULT 0 | Promedio ponderado |
| `total_orders` | `INTEGER` | NOT NULL, DEFAULT 0 | Total de órdenes procesadas |
| `on_time_deliveries` | `INTEGER` | NOT NULL, DEFAULT 0 | Entregas a tiempo |
| `calculated_at` | `TIMESTAMPTZ` | NOT NULL | Última vez que se calculó |

---

#### `purchase_orders`

Órdenes de compra emitidas a los proveedores.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `supplier_id` | `VARCHAR(30)` | FK → suppliers.id, NOT NULL | Proveedor |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal que recibe |
| `created_by` | `VARCHAR(30)` | FK → users.id, NOT NULL | Quien la creó |
| `approved_by` | `VARCHAR(30)` | FK → users.id, NULL | Quien la aprobó |
| `order_number` | `VARCHAR(50)` | NOT NULL | Número de OC (OC-2024-001) |
| `status` | `VARCHAR(30)` | NOT NULL, DEFAULT 'draft' | draft, pending_approval, approved, sent, partial, received, cancelled |
| `subtotal` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Subtotal |
| `tax` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Impuestos |
| `total` | `DECIMAL(15,2)` | NOT NULL, DEFAULT 0 | Total |
| `expected_delivery` | `DATE` | NULL | Fecha de entrega esperada |
| `delivered_at` | `TIMESTAMPTZ` | NULL | Fecha real de entrega |
| `notes` | `TEXT` | NULL | Notas |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id, status)`, `(tenant_id, supplier_id)`, `UNIQUE(tenant_id, order_number)`  
**Regla de negocio:** Solo usuarios con rol `AREA_MANAGER` del módulo NIRA o superior pueden cambiar status a `approved`.

---

#### `purchase_order_items`

Líneas de cada orden de compra.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `purchase_order_id` | `VARCHAR(30)` | FK → purchase_orders.id, NOT NULL | OC |
| `product_id` | `VARCHAR(30)` | FK → products.id, NOT NULL | Producto |
| `quantity_ordered` | `DECIMAL(10,2)` | NOT NULL | Cantidad ordenada |
| `quantity_received` | `DECIMAL(10,2)` | NOT NULL, DEFAULT 0 | Cantidad efectivamente recibida |
| `unit_cost` | `DECIMAL(15,2)` | NOT NULL | Costo unitario pactado |
| `total` | `DECIMAL(15,2)` | NOT NULL | Total de la línea |

**Índices:** `(purchase_order_id)`, `(product_id)`  
**Notas:** Cuando `quantity_received` iguala `quantity_ordered` en todas las líneas, la OC pasa a `received` y se genera automáticamente un `stock_movement` de entrada en KIRA.

---

### MÓDULO KIRA — Inventario

---

#### `products`

Catálogo global de productos por tenant. El stock es por sucursal, pero el producto es único.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `sku` | `VARCHAR(100)` | NOT NULL | Código único del producto |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre del producto |
| `description` | `TEXT` | NULL | Descripción detallada |
| `category` | `VARCHAR(100)` | NULL | Categoría |
| `unit` | `VARCHAR(50)` | NOT NULL, DEFAULT 'unidad' | Unidad de medida (unidad, kg, litro...) |
| `sale_price` | `DECIMAL(15,2)` | NULL | Precio de venta |
| `cost_price` | `DECIMAL(15,2)` | NULL | Costo promedio |
| `min_stock` | `INTEGER` | NOT NULL, DEFAULT 0 | Mínimo de stock — alerta si baja de aquí |
| `max_stock` | `INTEGER` | NULL | Máximo de stock — alerta si supera aquí |
| `abc_class` | `VARCHAR(1)` | NULL | Clasificación ABC (A, B, C) calculada automáticamente |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el producto está activo |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `UNIQUE(tenant_id, sku)`, `(tenant_id, category)`, `(tenant_id, abc_class)`

---

#### `stocks`

Stock actual de cada producto en cada sucursal. Es la única fuente de verdad del inventario en tiempo real.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `product_id` | `VARCHAR(30)` | FK → products.id, NOT NULL | Producto |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NOT NULL | Sucursal |
| `quantity` | `DECIMAL(10,2)` | NOT NULL, DEFAULT 0 | Cantidad actual en stock |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última actualización |

**Índices:** `UNIQUE(product_id, branch_id)`, `(branch_id)`  
**Regla de negocio:** `quantity` NUNCA puede ser negativo. Validar en la capa de servicio antes de guardar.

---

#### `stock_movements`

Historial inmutable de cada cambio en el inventario. Trazabilidad completa.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `product_id` | `VARCHAR(30)` | FK → products.id, NOT NULL | Producto |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NOT NULL | Sucursal donde ocurrió el movimiento |
| `user_id` | `VARCHAR(30)` | FK → users.id, NULL | Usuario responsable (NULL = sistema) |
| `type` | `VARCHAR(30)` | NOT NULL | entrada, salida, ajuste, transferencia, merma |
| `quantity` | `DECIMAL(10,2)` | NOT NULL | Cantidad del movimiento (positivo=entrada, negativo=salida) |
| `quantity_before` | `DECIMAL(10,2)` | NOT NULL | Stock antes del movimiento |
| `quantity_after` | `DECIMAL(10,2)` | NOT NULL | Stock después del movimiento |
| `reference_type` | `VARCHAR(50)` | NULL | Tipo de referencia (purchase_order, quote, manual) |
| `reference_id` | `VARCHAR(30)` | NULL | ID del documento que generó el movimiento |
| `lot_number` | `VARCHAR(100)` | NULL | Número de lote |
| `expiry_date` | `DATE` | NULL | Fecha de caducidad del lote |
| `notes` | `TEXT` | NULL | Notas del movimiento |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo ocurrió |

**Índices:** `(tenant_id, product_id)`, `(branch_id)`, `(created_at DESC)`, `(reference_type, reference_id)`  
**Notas:** Esta tabla es APPEND-ONLY. Nunca se modifica ni elimina un movimiento.

---

### MÓDULO AGENDA — Agendamiento

---

#### `service_types`

Tipos de servicios o citas que ofrece la empresa (ej: "Consulta médica", "Corte de cabello").

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal (NULL = todas) |
| `name` | `VARCHAR(255)` | NOT NULL | Nombre del servicio |
| `duration_minutes` | `INTEGER` | NOT NULL, DEFAULT 30 | Duración en minutos |
| `price` | `DECIMAL(15,2)` | NULL | Precio del servicio |
| `color` | `VARCHAR(7)` | NULL | Color en el calendario |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si el servicio está disponible |

**Índices:** `(tenant_id)`, `(tenant_id, branch_id)`

---

#### `availability`

Horarios de disponibilidad configurados por sucursal o profesional.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal |
| `user_id` | `VARCHAR(30)` | FK → users.id, NULL | Profesional (NULL = sucursal general) |
| `day_of_week` | `INTEGER` | NOT NULL, CHECK(0-6) | 0=Domingo, 1=Lunes... 6=Sábado |
| `start_time` | `TIME` | NOT NULL | Hora de inicio (ej: 08:00) |
| `end_time` | `TIME` | NOT NULL | Hora de fin (ej: 18:00) |
| `is_active` | `BOOLEAN` | NOT NULL, DEFAULT true | Si este horario está vigente |

**Índices:** `(tenant_id, branch_id, day_of_week)`

---

#### `appointments`

Citas agendadas. El agente de IA puede crearlas directamente desde WhatsApp.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NOT NULL | Sucursal |
| `client_id` | `VARCHAR(30)` | FK → clients.id, NULL | Cliente (NULL si aún no existe en el CRM) |
| `service_type_id` | `VARCHAR(30)` | FK → service_types.id, NULL | Tipo de servicio |
| `professional_id` | `VARCHAR(30)` | FK → users.id, NULL | Profesional asignado |
| `client_name` | `VARCHAR(255)` | NOT NULL | Nombre del cliente (desnormalizado para rapidez) |
| `client_phone` | `VARCHAR(20)` | NULL | Teléfono del cliente |
| `start_at` | `TIMESTAMPTZ` | NOT NULL | Inicio de la cita |
| `end_at` | `TIMESTAMPTZ` | NOT NULL | Fin de la cita |
| `status` | `VARCHAR(30)` | NOT NULL, DEFAULT 'scheduled' | scheduled, confirmed, completed, cancelled, no_show |
| `notes` | `TEXT` | NULL | Notas de la cita |
| `channel` | `VARCHAR(50)` | NOT NULL, DEFAULT 'manual' | whatsapp, email, manual |
| `reminder_sent` | `BOOLEAN` | NOT NULL, DEFAULT false | Si se envió recordatorio |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Fecha de creación |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Última modificación |

**Índices:** `(tenant_id, branch_id, start_at)`, `(tenant_id, status)`, `(professional_id, start_at)`

---

### MÓDULO VERA — Finanzas

---

#### `transactions`

Registro financiero de todos los movimientos de dinero. Generado automáticamente por ARI (ventas) y NIRA (compras). No se ingresa manualmente.

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | `VARCHAR(30)` | PK, NOT NULL | CUID |
| `tenant_id` | `VARCHAR(30)` | FK → tenants.id, NOT NULL | Empresa |
| `branch_id` | `VARCHAR(30)` | FK → branches.id, NULL | Sucursal |
| `type` | `VARCHAR(20)` | NOT NULL | income (ingreso) / expense (egreso) |
| `amount` | `DECIMAL(15,2)` | NOT NULL | Monto (siempre positivo) |
| `currency` | `VARCHAR(3)` | NOT NULL, DEFAULT 'COP' | Moneda |
| `description` | `VARCHAR(500)` | NOT NULL | Descripción del movimiento |
| `category` | `VARCHAR(100)` | NULL | Categoría contable |
| `reference_type` | `VARCHAR(50)` | NOT NULL | quote, purchase_order, manual |
| `reference_id` | `VARCHAR(30)` | NOT NULL | ID del documento origen |
| `date` | `DATE` | NOT NULL | Fecha del movimiento |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Cuándo fue registrado |

**Índices:** `(tenant_id, date DESC)`, `(tenant_id, type)`, `(reference_type, reference_id)`  
**Regla de negocio:** ARI genera una `transaction` de tipo `income` cuando una cotización cambia a `accepted`. NIRA genera una de tipo `expense` cuando una OC cambia a `approved`.

---

## Enumeraciones globales

```
Role:     SUPER_ADMIN | TENANT_ADMIN | BRANCH_ADMIN | AREA_MANAGER | OPERATIVE
Module:   ARI | NIRA | KIRA | AGENDA | VERA
```

---

## Convenciones

- Todos los IDs son CUID generados por Prisma (`@default(cuid())`)
- Todas las fechas son `TIMESTAMPTZ` (con zona horaria) — nunca `TIMESTAMP`
- Los campos de dinero son `DECIMAL(15,2)` — nunca `FLOAT`
- Los arrays de strings usan el tipo nativo de PostgreSQL `VARCHAR[]`
- Los campos JSON usan `JSONB` (indexable) — nunca `JSON`
- Nombres de tablas en `snake_case` plural
- Nombres de columnas en `snake_case`

---

## Row-Level Security (RLS)

Para activar RLS en todas las tablas de negocio, ejecutar después de cada migración:

```sql
-- Ejemplo para la tabla clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON clients
  USING (tenant_id = current_setting('app.current_tenant_id'));
```

El `tenant_id` se inyecta en cada conexión desde el middleware de Fastify antes de ejecutar cualquier query.
