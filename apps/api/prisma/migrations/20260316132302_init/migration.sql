-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'BRANCH_ADMIN', 'AREA_MANAGER', 'OPERATIVE');

-- CreateEnum
CREATE TYPE "ModuleName" AS ENUM ('ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WHATSAPP', 'GMAIL');

-- CreateTable
CREATE TABLE "tenants" (
    "id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "legal_name" VARCHAR(255),
    "tax_id" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'America/Bogota',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "logo_url" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "city" VARCHAR(100),
    "address" VARCHAR(500),
    "phone" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30),
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "module" "ModuleName",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "module" "ModuleName" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30),
    "channel" "Channel" NOT NULL,
    "identifier" VARCHAR(255) NOT NULL,
    "token_encrypted" TEXT,
    "metadata" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_logs" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "module" "ModuleName" NOT NULL,
    "channel" VARCHAR(50) NOT NULL,
    "input_message" TEXT NOT NULL,
    "reply" TEXT,
    "tools_used" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tool_details" JSONB NOT NULL,
    "turn_count" INTEGER NOT NULL DEFAULT 1,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(30) NOT NULL,
    "module" "ModuleName",
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "link" VARCHAR(500),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "whatsapp_id" VARCHAR(50),
    "company" VARCHAR(255),
    "tax_id" VARCHAR(50),
    "address" VARCHAR(500),
    "city" VARCHAR(100),
    "source" VARCHAR(50),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "assigned_to" VARCHAR(30),
    "branch_id" VARCHAR(30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "order" INTEGER NOT NULL,
    "color" VARCHAR(7),
    "is_final_won" BOOLEAN NOT NULL DEFAULT false,
    "is_final_lost" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30) NOT NULL,
    "stage_id" VARCHAR(30) NOT NULL,
    "assigned_to" VARCHAR(30),
    "branch_id" VARCHAR(30),
    "title" VARCHAR(255) NOT NULL,
    "value" DECIMAL(15,2),
    "probability" INTEGER,
    "expected_close" DATE,
    "lost_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interactions" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30) NOT NULL,
    "deal_id" VARCHAR(30),
    "user_id" VARCHAR(30),
    "type" VARCHAR(50) NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30) NOT NULL,
    "deal_id" VARCHAR(30),
    "created_by" VARCHAR(30) NOT NULL,
    "quote_number" VARCHAR(50) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "valid_until" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" VARCHAR(30) NOT NULL,
    "quote_id" VARCHAR(30) NOT NULL,
    "product_id" VARCHAR(30),
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "unit" VARCHAR(50) NOT NULL DEFAULT 'unidad',
    "sale_price" DECIMAL(15,2),
    "cost_price" DECIMAL(15,2),
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "max_stock" INTEGER,
    "abc_class" VARCHAR(1),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" VARCHAR(30) NOT NULL,
    "product_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "product_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(30),
    "type" VARCHAR(30) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "quantity_before" DECIMAL(10,2) NOT NULL,
    "quantity_after" DECIMAL(10,2) NOT NULL,
    "reference_type" VARCHAR(50),
    "reference_id" VARCHAR(30),
    "lot_number" VARCHAR(100),
    "expiry_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "contact_name" VARCHAR(255),
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "tax_id" VARCHAR(50),
    "address" VARCHAR(500),
    "city" VARCHAR(100),
    "payment_terms" INTEGER,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_scores" (
    "id" VARCHAR(30) NOT NULL,
    "supplier_id" VARCHAR(30) NOT NULL,
    "price_score" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "delivery_score" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "quality_score" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "overall_score" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "on_time_deliveries" INTEGER NOT NULL DEFAULT 0,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supplier_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "supplier_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30),
    "created_by" VARCHAR(30) NOT NULL,
    "approved_by" VARCHAR(30),
    "order_number" VARCHAR(50) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "expected_delivery" DATE,
    "delivered_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" VARCHAR(30) NOT NULL,
    "purchase_order_id" VARCHAR(30) NOT NULL,
    "product_id" VARCHAR(30) NOT NULL,
    "quantity_ordered" DECIMAL(10,2) NOT NULL,
    "quantity_received" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(15,2) NOT NULL,
    "total" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30),
    "name" VARCHAR(255) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "price" DECIMAL(15,2),
    "color" VARCHAR(7),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30),
    "user_id" VARCHAR(30),
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30),
    "service_type_id" VARCHAR(30),
    "professional_id" VARCHAR(30),
    "client_name" VARCHAR(255) NOT NULL,
    "client_phone" VARCHAR(20),
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "channel" VARCHAR(50) NOT NULL DEFAULT 'manual',
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" VARCHAR(30) NOT NULL,
    "tenant_id" VARCHAR(30) NOT NULL,
    "branch_id" VARCHAR(30),
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'COP',
    "description" VARCHAR(500) NOT NULL,
    "category" VARCHAR(100),
    "reference_type" VARCHAR(50) NOT NULL,
    "reference_id" VARCHAR(30) NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "branches_tenant_id_idx" ON "branches"("tenant_id");

-- CreateIndex
CREATE INDEX "branches_tenant_id_is_active_idx" ON "branches"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_role_idx" ON "users"("tenant_id", "role");

-- CreateIndex
CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_tenant_id_module_key" ON "feature_flags"("tenant_id", "module");

-- CreateIndex
CREATE INDEX "integrations_tenant_id_idx" ON "integrations"("tenant_id");

-- CreateIndex
CREATE INDEX "integrations_channel_identifier_idx" ON "integrations"("channel", "identifier");

-- CreateIndex
CREATE INDEX "agent_logs_tenant_id_idx" ON "agent_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "agent_logs_tenant_id_module_idx" ON "agent_logs"("tenant_id", "module");

-- CreateIndex
CREATE INDEX "agent_logs_created_at_idx" ON "agent_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_is_read_idx" ON "notifications"("tenant_id", "user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at" DESC);

-- CreateIndex
CREATE INDEX "clients_tenant_id_idx" ON "clients"("tenant_id");

-- CreateIndex
CREATE INDEX "clients_tenant_id_assigned_to_idx" ON "clients"("tenant_id", "assigned_to");

-- CreateIndex
CREATE INDEX "clients_whatsapp_id_idx" ON "clients"("whatsapp_id");

-- CreateIndex
CREATE INDEX "clients_tenant_id_is_active_idx" ON "clients"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "pipeline_stages_tenant_id_order_idx" ON "pipeline_stages"("tenant_id", "order");

-- CreateIndex
CREATE INDEX "deals_tenant_id_stage_id_idx" ON "deals"("tenant_id", "stage_id");

-- CreateIndex
CREATE INDEX "deals_tenant_id_assigned_to_idx" ON "deals"("tenant_id", "assigned_to");

-- CreateIndex
CREATE INDEX "deals_client_id_idx" ON "deals"("client_id");

-- CreateIndex
CREATE INDEX "interactions_tenant_id_client_id_idx" ON "interactions"("tenant_id", "client_id");

-- CreateIndex
CREATE INDEX "interactions_created_at_idx" ON "interactions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "quotes_tenant_id_client_id_idx" ON "quotes"("tenant_id", "client_id");

-- CreateIndex
CREATE INDEX "quotes_tenant_id_status_idx" ON "quotes"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_tenant_id_quote_number_key" ON "quotes"("tenant_id", "quote_number");

-- CreateIndex
CREATE INDEX "quote_items_quote_id_idx" ON "quote_items"("quote_id");

-- CreateIndex
CREATE INDEX "products_tenant_id_category_idx" ON "products"("tenant_id", "category");

-- CreateIndex
CREATE INDEX "products_tenant_id_abc_class_idx" ON "products"("tenant_id", "abc_class");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "stocks_branch_id_idx" ON "stocks"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_product_id_branch_id_key" ON "stocks"("product_id", "branch_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_product_id_idx" ON "stock_movements"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_movements_branch_id_idx" ON "stock_movements"("branch_id");

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_reference_type_reference_id_idx" ON "stock_movements"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_idx" ON "suppliers"("tenant_id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_is_active_idx" ON "suppliers"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_scores_supplier_id_key" ON "supplier_scores"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_status_idx" ON "purchase_orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_supplier_id_idx" ON "purchase_orders"("tenant_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_order_number_key" ON "purchase_orders"("tenant_id", "order_number");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_items_product_id_idx" ON "purchase_order_items"("product_id");

-- CreateIndex
CREATE INDEX "service_types_tenant_id_idx" ON "service_types"("tenant_id");

-- CreateIndex
CREATE INDEX "service_types_tenant_id_branch_id_idx" ON "service_types"("tenant_id", "branch_id");

-- CreateIndex
CREATE INDEX "availability_tenant_id_branch_id_day_of_week_idx" ON "availability"("tenant_id", "branch_id", "day_of_week");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_branch_id_start_at_idx" ON "appointments"("tenant_id", "branch_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_status_idx" ON "appointments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "appointments_professional_id_start_at_idx" ON "appointments"("professional_id", "start_at");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_date_idx" ON "transactions"("tenant_id", "date" DESC);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_type_idx" ON "transactions"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "transactions_reference_type_reference_id_idx" ON "transactions"("reference_type", "reference_id");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_logs" ADD CONSTRAINT "agent_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_scores" ADD CONSTRAINT "supplier_scores_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability" ADD CONSTRAINT "availability_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability" ADD CONSTRAINT "availability_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability" ADD CONSTRAINT "availability_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
