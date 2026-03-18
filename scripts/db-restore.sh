#!/usr/bin/env bash
# =============================================================================
# db-restore.sh — Restaura la base de datos desde un archivo .dump
#
# USO:
#   DATABASE_URL="postgresql://..." bash scripts/db-restore.sh backups/nexor_20260318_120000.dump
#
# ADVERTENCIA:
#   Este script ELIMINA y RECREA el schema publico antes de restaurar.
#   Todos los datos existentes se perderan. Usar solo en emergencias o en
#   ambientes de prueba.
#
# REQUISITOS:
#   pg_restore instalado (incluido con PostgreSQL)
# =============================================================================

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ ERROR: DATABASE_URL no esta definida."
  exit 1
fi

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "❌ ERROR: Debes indicar el archivo de backup."
  echo "   Uso: DATABASE_URL='postgresql://...' bash scripts/db-restore.sh backups/nexor_YYYYMMDD.dump"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ ERROR: El archivo '$BACKUP_FILE' no existe."
  exit 1
fi

echo "⚠️  ADVERTENCIA: Esta operacion eliminara TODOS los datos actuales."
echo "   Base de datos: $DATABASE_URL"
echo "   Backup a restaurar: $BACKUP_FILE"
echo ""
read -r -p "¿Confirmas la restauracion? Escribe 'RESTAURAR' para continuar: " CONFIRM

if [ "$CONFIRM" != "RESTAURAR" ]; then
  echo "Operacion cancelada."
  exit 0
fi

echo ""
echo "🔄 Iniciando restauracion..."

# Eliminar y recrear el schema publico para partir de cero
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true

# Restaurar desde el dump
pg_restore \
  --no-acl \
  --no-owner \
  --dbname="$DATABASE_URL" \
  "$BACKUP_FILE"

echo ""
echo "✅ Restauracion completada."
echo ""
echo "Proximos pasos obligatorios:"
echo "  1. Ejecutar RLS:  DATABASE_URL='...' pnpm --filter @nexor/api db:rls"
echo "  2. Verificar datos: pnpm --filter @nexor/api db:studio"
