CREATE TYPE "price_list_status" AS ENUM('draft', 'active');--> statement-breakpoint
CREATE TYPE "price_list_type" AS ENUM('sale', 'override');--> statement-breakpoint
CREATE TYPE "price_rule_operator" AS ENUM('eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in');--> statement-breakpoint
CREATE TABLE "price_list_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_list_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"price_list_id" integer NOT NULL,
	"attribute" text NOT NULL,
	"operator" "price_rule_operator" DEFAULT 'eq'::"price_rule_operator" NOT NULL,
	"value" jsonb NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_lists_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "price_list_type" NOT NULL,
	"status" "price_list_status" DEFAULT 'draft'::"price_list_status" NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"price_id" integer NOT NULL,
	"attribute" text NOT NULL,
	"operator" "price_rule_operator" DEFAULT 'eq'::"price_rule_operator" NOT NULL,
	"value" jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_sets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_sets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "prices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"price_set_id" integer NOT NULL,
	"price_list_id" integer,
	"currency_code" text NOT NULL,
	"amount" numeric NOT NULL,
	"min_quantity" integer,
	"max_quantity" integer,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_price_amount_nonneg" CHECK ("amount" >= 0),
	CONSTRAINT "chk_price_min_qty" CHECK ("min_quantity" IS NULL OR "min_quantity" >= 1),
	CONSTRAINT "chk_price_max_qty" CHECK ("max_quantity" IS NULL OR "max_quantity" >= 1),
	CONSTRAINT "chk_price_max_ge_min" CHECK ("max_quantity" IS NULL OR "min_quantity" IS NULL OR "max_quantity" >= "min_quantity")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_rules_list_attr_uniq" ON "price_list_rules" ("price_list_id","attribute") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "price_list_rules_list_id_idx" ON "price_list_rules" ("price_list_id");--> statement-breakpoint
CREATE INDEX "price_lists_organization_id_idx" ON "price_lists" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_rules_price_attr_uniq" ON "price_rules" ("price_id","attribute") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "price_rules_price_id_idx" ON "price_rules" ("price_id");--> statement-breakpoint
CREATE INDEX "price_sets_organization_id_idx" ON "price_sets" ("organization_id");--> statement-breakpoint
CREATE INDEX "prices_price_set_id_idx" ON "prices" ("price_set_id");--> statement-breakpoint
CREATE INDEX "prices_price_list_id_idx" ON "prices" ("price_list_id");--> statement-breakpoint
CREATE INDEX "prices_set_currency_idx" ON "prices" ("price_set_id","currency_code");--> statement-breakpoint
ALTER TABLE "price_list_rules" ADD CONSTRAINT "price_list_rules_price_list_id_price_lists_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_price_id_prices_id_fkey" FOREIGN KEY ("price_id") REFERENCES "prices"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_price_set_id_price_sets_id_fkey" FOREIGN KEY ("price_set_id") REFERENCES "price_sets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_price_list_id_price_lists_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE;