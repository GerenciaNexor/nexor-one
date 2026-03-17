# README_DEVELOPMENT — Guía de Desarrollo Local NEXOR

> Sigue estos pasos en orden. Si algo no funciona, revisa la sección **Debugging y problemas comunes** al final.

---

## 1. Prerequisitos

| Herramienta | Versión mínima | Cómo verificar |
|-------------|---------------|----------------|
| Node.js | 20.x | `node --version` |
| pnpm | 9.x o 10.x | `pnpm --version` |
| Git | cualquiera | `git --version` |
| PostgreSQL | 15.x | `psql --version` |
| Redis | 7.x | `redis-cli --version` |

**Instalar pnpm** (si no lo tienes):
```bash
npm install -g pnpm
```

> PostgreSQL y Redis pueden correrse localmente o usar servicios cloud como Railway (recomendado para desarrollo).

---

## 2. Instalación desde cero

### 2.1 Clonar el repositorio

```bash
git clone https://github.com/nexor-one/nexor.git
cd nexor
```

### 2.2 Instalar dependencias

```bash
pnpm install
```

Esto instala las dependencias de todos los paquetes del monorepo en un solo comando.

### 2.3 Configurar variables de entorno

```bash
cp .env.example apps/api/.env
```

Edita `apps/api/.env` y configura la conexión a la base de datos (ver opciones abajo).

### 2.4 Levantar PostgreSQL y Redis

**Opción A — Docker Compose (recomendado):**

```bash
docker-compose up -d
```

Esto levanta PostgreSQL 16 en `localhost:5432` y Redis 7 en `localhost:6379`.

Con Docker Compose, las credenciales en `apps/api/.env` son:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5433/nexor_dev"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="dev_secret_32_chars_minimum_for_jwt_signing"
```

> **Nota:** El Docker Compose usa el puerto `5433` (no `5432`) para evitar conflictos con PostgreSQL que ya pueda tener instalado en el sistema.

**Opción B — PostgreSQL instalado en el sistema:**

```bash
createdb nexor_dev
```

Ajusta `DATABASE_URL` en `apps/api/.env` según tus credenciales locales.

### 2.5 Ejecutar migraciones, RLS y seed (todo en un comando)

```bash
pnpm --filter @nexor/api db:setup
```

Este comando hace tres cosas en orden:
1. `prisma migrate dev` — crea las 24 tablas en la BD
2. `tsx prisma/setup-rls.ts` — habilita Row-Level Security en las 19 tablas de negocio
3. `prisma db seed` — carga los datos de prueba

**Datos de prueba creados:**

| Campo | Valor |
|-------|-------|
| Email | `admin@demo.nexor.co` |
| Contraseña | `Admin123!` |
| Tenant | `Farmacia Demo S.A.S.` |
| Slug | `demo-farmacia` |

### 2.6 Verificar la conexión

```bash
curl http://localhost:3001/health
# {"success":true,"data":{"version":"1.0.0","db":"connected"}}
```

### 2.7 Levantar el entorno de desarrollo

```bash
pnpm dev
```

Esto levanta simultáneamente:
- **API** → [http://localhost:3001](http://localhost:3001)
- **Frontend** → [http://localhost:3000](http://localhost:3000)

Verifica que la API responde:
```bash
curl http://localhost:3001/health
# {"success":true,"data":{"version":"1.0.0"}}
```

---

## 3. Comandos del día a día

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Levanta API y frontend en paralelo con hot-reload |
| `pnpm build` | Compila todos los paquetes para producción |
| `pnpm lint` | Corre ESLint en todos los paquetes |
| `pnpm type-check` | Verifica tipos TypeScript sin emitir archivos |
| `pnpm clean` | Elimina carpetas `dist/` y `.next/` |

**Comandos específicos por paquete** (usar `--filter`):

```bash
# Solo el backend
pnpm --filter @nexor/api dev
pnpm --filter @nexor/api build

# Solo el frontend
pnpm --filter @nexor/web dev
pnpm --filter @nexor/web build

# Solo tipos compartidos
pnpm --filter @nexor/shared type-check
```

**Comandos de Prisma:**

```bash
# Generar el cliente de Prisma (necesario tras cambios al schema)
pnpm --filter @nexor/api exec prisma generate

# Crear y aplicar una nueva migración
pnpm --filter @nexor/api exec prisma migrate dev --name nombre_de_la_migracion

# Abrir Prisma Studio (UI para inspeccionar la DB)
pnpm --filter @nexor/api exec prisma studio

# Resetear la base de datos (¡borra todos los datos!)
pnpm --filter @nexor/api exec prisma migrate reset
```

---

## 4. Variables de entorno

Todas las variables están documentadas en [`.env.example`](./.env.example) con descripción de para qué sirve cada una.

**Variables obligatorias para desarrollo local:**

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `REDIS_URL` | Conexión a Redis |
| `JWT_SECRET` | Clave para firmar tokens JWT |
| `NEXT_PUBLIC_API_URL` | URL de la API que usa el frontend |

**Variables opcionales** (solo se necesitan si trabajas esas integraciones):
- `ANTHROPIC_API_KEY` — para probar los agentes de IA
- `WHATSAPP_ACCESS_TOKEN` — para probar el webhook de WhatsApp
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — para la integración con Gmail
- `RESEND_API_KEY` — para envío de emails

---

## 5. Estructura de ramas y flujo de PRs

### Ramas

| Rama | Propósito |
|------|-----------|
| `main` | Código en producción. Solo se toca vía PR. |
| `develop` | Rama de integración. Base para los PRs del sprint. |
| `feature/HU-XXX-descripcion` | Rama por historia de usuario. |
| `fix/HU-XXX-descripcion` | Rama para bugfixes. |

### Flujo

```bash
# 1. Crear rama desde develop
git checkout develop
git pull origin develop
git checkout -b feature/HU-002-auth-login

# 2. Desarrollar y hacer commits
git add apps/api/src/modules/auth/
git commit -m "feat(auth): implementar endpoint de login con JWT"

# 3. Abrir PR hacia develop
gh pr create --base develop --title "HU-002: Auth — login y JWT"
```

### Requisitos de un PR para ser aprobado

- [ ] Los criterios de aceptación de la historia están cumplidos
- [ ] `pnpm lint` pasa sin errores
- [ ] `pnpm type-check` pasa sin errores
- [ ] `pnpm build` compila sin errores
- [ ] Al menos un reviewer aprobó el PR

---

## 6. Convenciones de código

### Nombres de archivos y carpetas

- **Carpetas y archivos:** `kebab-case` (ej: `create-order.ts`, `auth-service.ts`)
- **Componentes React:** `PascalCase` (ej: `LoginForm.tsx`, `DashboardHeader.tsx`)
- **Tipos e interfaces:** `PascalCase` (ej: `AuthUser`, `ApiResponse`)

### Estructura de un módulo del backend

Cada módulo en `apps/api/src/modules/<nombre>/` sigue esta estructura:

```
modulo/
├── index.ts          ← Exporta el plugin de Fastify que registra las rutas
├── routes.ts         ← Define las rutas: valida input con Zod, llama al service
├── service.ts        ← Lógica de negocio: reglas, llama a Prisma
└── schema.ts         ← Schemas de Zod para validar requests y responses
```

**Regla:** La lógica de negocio va en `service.ts`, nunca en `routes.ts`.

### Qué va en `packages/shared` y qué no

**SÍ va en shared:**
- Tipos que usa tanto el frontend como el backend (ej: `AuthUser`, `Tenant`, `ApiResponse`)
- Enums compartidos (ej: `Role`, `ModuleName`, `ChannelType`)

**NO va en shared:**
- Tipos que solo usa el backend (ej: tipos internos de Prisma)
- Tipos que solo usa el frontend (ej: props de componentes React)
- Lógica de negocio o funciones — solo tipos

---

## 7. Debugging y problemas comunes

### `pnpm install` falla

```bash
# Limpiar caché y reinstalar
pnpm store prune
rm -rf node_modules
pnpm install
```

### Error de conexión a PostgreSQL

Verifica que `DATABASE_URL` en `.env` es correcta y que PostgreSQL está corriendo:
```bash
psql $DATABASE_URL -c "SELECT 1"
```

### Error: `@prisma/client did not initialize yet`

El cliente de Prisma necesita regenerarse:
```bash
pnpm --filter @nexor/api exec prisma generate
```

### El tipo de `@nexor/shared` no se resuelve

Verifica que el workspace está correctamente instalado:
```bash
pnpm --filter @nexor/api exec node -e "require('@nexor/shared')"
```

Si falla, reinstala:
```bash
pnpm install
```

### Hot-reload no funciona en Windows

tsx y Next.js usan file watchers. En Windows con OneDrive activo puede haber conflictos.
Asegúrate de que el repositorio esté en una carpeta **no sincronizada por OneDrive** o excluye la carpeta del proyecto de la sincronización.

### Puerto 3001 o 3000 en uso

```bash
# Ver qué proceso ocupa el puerto
netstat -ano | findstr :3001   # Windows
lsof -i :3001                  # macOS/Linux

# Matar el proceso (reemplaza PID)
taskkill /PID <PID> /F         # Windows
kill -9 <PID>                  # macOS/Linux
```
