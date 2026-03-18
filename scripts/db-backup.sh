#!/usr/bin/env bash
# =============================================================================
# db-backup.sh — Genera un backup manual de la base de datos
#
# USO:
#   # Backup de produccion (Railway):
#   DATABASE_URL="postgresql://..." bash scripts/db-backup.sh
#
#   # Backup local:
#   DATABASE_URL="postgresql://postgres:password@localhost:5433/nexor_dev" bash scripts/db-backup.sh
#
# SALIDA:
#   backups/nexor_YYYYMMDD_HHMMSS.dump
#
# REQUISITOS:
#   pg_dump instalado (incluido con PostgreSQL)
#   macOS:  brew install postgresql
#   Linux:  apt install postgresql-client
#   Windows: instalar PostgreSQL o usar WSL
# =============================================================================

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ ERROR: DATABASE_URL no esta definida."
  echo "   Ejemplo: DATABASE_URL='postgresql://...' bash scripts/db-backup.sh"
  exit 1
fi

BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="nexor_${TIMESTAMP}.dump"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

echo "🔒 Generando backup..."
echo "   Destino: ${FILEPATH}"

pg_dump \
  "$DATABASE_URL" \
  --format=custom \
  --no-acl \
  --no-owner \
  --file="$FILEPATH"

SIZE=$(du -sh "$FILEPATH" | cut -f1)

echo ""
echo "✅ Backup completado"
echo "   Archivo: ${FILENAME}"
echo "   Tamaño:  ${SIZE}"
echo ""
echo "⚠️  Verifica el backup antes de continuar con cualquier migracion:"
echo "   pg_restore --list ${FILEPATH} | head -20"
