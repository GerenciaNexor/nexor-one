-- CreateTable: transaction_categories
CREATE TABLE "transaction_categories" (
    "id"         VARCHAR(30)  NOT NULL,
    "tenant_id"  VARCHAR(30)  NOT NULL,
    "name"       VARCHAR(100) NOT NULL,
    "type"       VARCHAR(10)  NOT NULL,
    "color"      VARCHAR(7),
    "is_default" BOOLEAN      NOT NULL DEFAULT false,
    "is_active"  BOOLEAN      NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cost_centers
CREATE TABLE "cost_centers" (
    "id"          VARCHAR(30)  NOT NULL,
    "tenant_id"   VARCHAR(30)  NOT NULL,
    "name"        VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_active"   BOOLEAN      NOT NULL DEFAULT true,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- AlterTable: transactions — add FK columns
ALTER TABLE "transactions"
    ADD COLUMN "category_id"   VARCHAR(30),
    ADD COLUMN "cost_center_id" VARCHAR(30);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_categories_tenant_id_name_key"
    ON "transaction_categories"("tenant_id", "name");

CREATE INDEX "transaction_categories_tenant_id_idx"
    ON "transaction_categories"("tenant_id");

CREATE UNIQUE INDEX "cost_centers_tenant_id_name_key"
    ON "cost_centers"("tenant_id", "name");

CREATE INDEX "cost_centers_tenant_id_idx"
    ON "cost_centers"("tenant_id");

CREATE INDEX "transactions_tenant_id_category_id_idx"
    ON "transactions"("tenant_id", "category_id");

-- AddForeignKey
ALTER TABLE "transaction_categories"
    ADD CONSTRAINT "transaction_categories_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_centers"
    ADD CONSTRAINT "cost_centers_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transactions"
    ADD CONSTRAINT "transactions_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "transaction_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transactions"
    ADD CONSTRAINT "transactions_cost_center_id_fkey"
    FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
