#!/usr/bin/env bash
# =============================================================================
# setup-db-user.sh — Configura el rol nexor_app en PostgreSQL
#
# Ejecutar UNA SOLA VEZ antes de correr la primera migración en un entorno nuevo.
# El rol nexor_app es el usuario que usa Fastify en runtime (subject to RLS).
# El usuario postgres sigue usándose para migraciones y seeds (bypassa RLS).
#
# Uso:
#   ./scripts/setup-db-user.sh
#
# Variables de entorno opcionales:
#   DB_HOST     — host de PostgreSQL (default: localhost)
#   DB_PORT     — puerto (default: 5433)
#   DB_NAME     — nombre de la base de datos (default: nexor_dev)
#   DB_ADMIN    — usuario administrador (default: postgres)
#   DB_PASSWORD — contraseña del admin (default: password)
#   APP_PASSWORD — contraseña para nexor_app (default: nexor_app_secret)
# =============================================================================

set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-nexor_dev}"
DB_ADMIN="${DB_ADMIN:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-password}"
APP_PASSWORD="${APP_PASSWORD:-nexor_app_secret}"

export PGPASSWORD="$DB_PASSWORD"

echo "⚙️  Configurando rol nexor_app en ${DB_HOST}:${DB_PORT}/${DB_NAME}..."

psql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_ADMIN" \
  --dbname="$DB_NAME" \
  <<-SQL

-- Crear rol si no existe
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'nexor_app') THEN
    CREATE ROLE nexor_app WITH LOGIN PASSWORD '${APP_PASSWORD}';
    RAISE NOTICE 'Rol nexor_app creado.';
  ELSE
    ALTER ROLE nexor_app WITH PASSWORD '${APP_PASSWORD}';
    RAISE NOTICE 'Rol nexor_app ya existe — contraseña actualizada.';
  END IF;
END
\$\$;

-- Permitir conexión a la base de datos
GRANT CONNECT ON DATABASE ${DB_NAME} TO nexor_app;

-- Privilegios de esquema
GRANT USAGE ON SCHEMA public TO nexor_app;

-- Acceso a todas las tablas y secuencias existentes
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexor_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexor_app;

-- Acceso automático a tablas y secuencias futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexor_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO nexor_app;

SQL

echo ""
echo "✅ Rol nexor_app configurado correctamente."
echo ""
echo "   Actualiza tu .env con:"
echo "   DATABASE_URL=\"postgresql://nexor_app:${APP_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}\""
echo "   DIRECT_DATABASE_URL=\"postgresql://${DB_ADMIN}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}\""
echo ""
