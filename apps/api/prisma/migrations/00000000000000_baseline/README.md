# Baseline consolidado (2026-08 · Sprint 19)

Este `00000000000000_baseline` **reemplaza las 39 migraciones anteriores** (`20260*`), que fueron
consolidadas en un único punto de partida que reproduce EXACTAMENTE el esquema de producción.

## Por qué (diagnóstico del drift)

Un `migrate reset` desde cero **no reproducía** ni producción ni `schema.prisma`. `migrate status`
estaba limpio (todas aplicadas), pero replayar el historial desde cero divergía en dos ejes:

**Eje A — el replay del historial ≠ PROD** (varias migraciones se editaron a mano tras aplicarse):
- `updated_at` con `DEFAULT CURRENT_TIMESTAMP` en `cost_centers`, `monthly_budgets`,
  `transaction_categories`, `transactions` — el replay las creaba con default; prod no lo tenía
  (el modelo pasó a `@updatedAt`, sin default, pero los archivos de migración no se corrigieron).
- `appointment_cancel_tokens` — definición de FKs distinta entre replay y prod.

**Eje B — PROD ≠ `schema.prisma`** (índices):
- `conversation_messages_external_message_id_idx` era **parcial** en prod (`WHERE ... IS NOT NULL`),
  pero `schema.prisma` declara un `@@index` normal (Prisma no expresa índices parciales) → drift eterno.
- `reminders_tenant_user_status_idx` — índice huérfano de 3 columnas en prod, no declarado en el modelo.
- `rentals_*` — dos índices con nombre corto a mano (HU-158) vs el nombre por defecto de Prisma.

Drift enredado (mezcla de los dos ejes) → se optó por **regenerar el baseline** (no una correctiva).

## Qué se hizo (sin alterar datos de producción)

1. **Eje B** — se alineó prod a `schema.prisma` con 4 operaciones de índice **no destructivas**
   (índice parcial→normal, drop del huérfano, rename ×2). Cero cambios de datos/tablas.
2. **Baseline** — se generó desde `schema.prisma` (`migrate diff --from-empty --to-schema-datamodel`,
   ya idéntico a prod) y se borraron las 39 migraciones viejas. El **Eje A** desapareció al descartar
   los archivos con el cruft.
3. **Bookkeeping** — en prod se vació `_prisma_migrations` (solo el ledger, respaldado antes) y se marcó
   este baseline como aplicado con `prisma migrate resolve --applied 00000000000000_baseline`
   (**no** se re-ejecutó SQL contra prod).

## Verificación (todo en BD temporal + read-only sobre prod)

- `migrate status` (prod): al día, 1 migración.
- `migrate diff` reset(baseline) → prod: **vacío** (el reset reproduce prod).
- `migrate diff` prod/reset → `schema.prisma`: **vacío** (`migrate dev` no propone nada).
- `db:audit-rls`: **34/34 tablas aisladas**, exit 0 (el RLS de `setup-rls.ts` sobrevive el baseline;
  el RLS **no** vive en las migraciones — se aplica siempre con `db:rls`).

> RLS y el rol `nexor_app` **no** están en este baseline (nunca estuvieron en las migraciones): son la
> responsabilidad de `setup-rls.ts` (`db:rls`), que debe correrse tras cada `migrate reset`/restore.
