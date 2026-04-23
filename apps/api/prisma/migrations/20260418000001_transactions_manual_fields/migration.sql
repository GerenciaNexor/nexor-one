-- AlterTable transactions: add manual-transaction fields
ALTER TABLE "transactions"
    ADD COLUMN "is_manual"          BOOLEAN      NOT NULL DEFAULT false,
    ADD COLUMN "external_reference" VARCHAR(255),
    ADD COLUMN "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Make reference_type and reference_id nullable (manual transactions don't have them)
ALTER TABLE "transactions"
    ALTER COLUMN "reference_type" DROP NOT NULL,
    ALTER COLUMN "reference_id"   DROP NOT NULL;

-- Index for filtering manual vs automatic
CREATE INDEX "transactions_tenant_id_is_manual_idx"
    ON "transactions"("tenant_id", "is_manual");
