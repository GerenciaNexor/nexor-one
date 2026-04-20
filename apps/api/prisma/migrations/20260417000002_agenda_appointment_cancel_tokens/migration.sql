-- HU-070: Token de cancelación para recordatorios de citas
CREATE TABLE "appointment_cancel_tokens" (
  "id"             VARCHAR(30)  NOT NULL,
  "token"          VARCHAR(64)  NOT NULL,
  "tenant_id"      VARCHAR(30)  NOT NULL,
  "appointment_id" VARCHAR(30)  NOT NULL,
  "expires_at"     TIMESTAMPTZ  NOT NULL,
  "used_at"        TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "appointment_cancel_tokens_pkey"            PRIMARY KEY ("id"),
  CONSTRAINT "appointment_cancel_tokens_token_key"       UNIQUE ("token"),
  CONSTRAINT "appointment_cancel_tokens_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")      REFERENCES "tenants"      ("id") ON DELETE CASCADE,
  CONSTRAINT "appointment_cancel_tokens_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments" ("id") ON DELETE CASCADE
);

CREATE INDEX "appointment_cancel_tokens_appointment_id_idx"
  ON "appointment_cancel_tokens" ("appointment_id");
