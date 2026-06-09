CREATE TYPE "product_attribute_assignment" AS ENUM('PRODUCT', 'VARIANT');--> statement-breakpoint
CREATE TYPE "product_media_type" AS ENUM('IMAGE', 'VIDEO');--> statement-breakpoint
CREATE TYPE "product_value_kind" AS ENUM('VALUE', 'SWATCH', 'REFERENCE', 'TEXT', 'NUMERIC', 'BOOLEAN', 'DATE', 'FILE');--> statement-breakpoint
CREATE TABLE "product_type_attributes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_type_attributes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_type_id" integer NOT NULL,
	"organization_id" integer,
	"attribute_id" integer NOT NULL,
	"assignment" "product_attribute_assignment" NOT NULL,
	"variant_selection" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_type_attributes_uniq" UNIQUE("product_type_id","organization_id","attribute_id"),
	CONSTRAINT "chk_pta_variant_selection" CHECK ("variant_selection" = false OR "assignment" = 'VARIANT')
);
--> statement-breakpoint
CREATE TABLE "product_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_shipping_required" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_variants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer,
	"product_id" integer NOT NULL,
	"sku" text,
	"position" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer,
	"product_type_id" integer NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"thumbnail_url" text,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "product_type_attributes_type_idx" ON "product_type_attributes" ("product_type_id");--> statement-breakpoint
CREATE INDEX "product_types_org_idx" ON "product_types" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_types_org_slug_uniq" ON "product_types" ("organization_id","slug") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_org_sku_uniq" ON "product_variants" ("organization_id","sku") WHERE "sku" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "products_org_idx" ON "products" ("organization_id");--> statement-breakpoint
CREATE INDEX "products_type_idx" ON "products" ("product_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_handle_uniq" ON "products" ("organization_id","handle") WHERE "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "product_type_attributes" ADD CONSTRAINT "product_type_attributes_product_type_id_product_types_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_types"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_product_type_id_product_types_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_types"("id") ON DELETE RESTRICT;