-- HU-134 — Identidad de PLATAFORMA separada del mundo de los clientes.
-- Tabla platform_admins SIN tenant_id: el equipo NEXOR no pertenece a ninguna empresa.
-- La RLS (deny-all para nexor_app) NO va aquí: se aplica en db:rls (setup-rls.ts),
-- fuente única de verdad de las políticas, igual que el resto de tablas.

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");
