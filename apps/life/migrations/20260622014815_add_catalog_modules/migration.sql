-- Enable pg_trgm before the gin_trgm_ops indexes below (attributes name/slug).
-- App-level migrations are schema-generated and don't capture the attribute
-- module's standalone enable_pg_trgm migration, so it's prepended here.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "attribute_type" AS ENUM('DROPDOWN', 'MULTISELECT', 'PLAIN_TEXT', 'RICH_TEXT', 'NUMERIC', 'BOOLEAN', 'FILE', 'REFERENCE', 'SWATCH', 'DATE', 'DATE_TIME');--> statement-breakpoint
CREATE TYPE "attribute_unit" AS ENUM('KILOGRAM', 'GRAM', 'POUND', 'OUNCE', 'METER', 'CENTIMETER', 'MILLIMETER', 'INCH', 'FOOT', 'LITER', 'MILLILITER', 'GALLON', 'SQUARE_METER', 'SQUARE_CENTIMETER', 'PIECE', 'PERCENT');--> statement-breakpoint
CREATE TYPE "price_list_status" AS ENUM('draft', 'active');--> statement-breakpoint
CREATE TYPE "price_list_type" AS ENUM('sale', 'override');--> statement-breakpoint
CREATE TYPE "price_rule_operator" AS ENUM('eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in');--> statement-breakpoint
CREATE TYPE "product_attribute_assignment" AS ENUM('PRODUCT', 'VARIANT');--> statement-breakpoint
CREATE TYPE "product_listing_review_state" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "product_media_type" AS ENUM('IMAGE', 'VIDEO');--> statement-breakpoint
CREATE TYPE "taxonomy_entity_type" AS ENUM('category', 'product_type');--> statement-breakpoint
CREATE TYPE "taxonomy_request_kind" AS ENUM('create', 'promote');--> statement-breakpoint
CREATE TYPE "taxonomy_request_state" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "locales" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "locales_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribute_boolean_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attribute_boolean_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attribute_id" integer NOT NULL,
	"organization_id" integer,
	"value" boolean NOT NULL,
	"external_source" varchar(100),
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_boolean_values_external" UNIQUE("external_source","external_id")
);
--> statement-breakpoint
CREATE TABLE "attribute_date_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attribute_date_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attribute_id" integer NOT NULL,
	"organization_id" integer,
	"value" timestamp with time zone NOT NULL,
	"external_source" varchar(100),
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_date_values_external" UNIQUE("external_source","external_id")
);
--> statement-breakpoint
CREATE TABLE "attribute_file_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attribute_file_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attribute_id" integer NOT NULL,
	"organization_id" integer,
	"file_url" varchar(2048) NOT NULL,
	"mimetype" varchar(100) NOT NULL,
	"external_source" varchar(100),
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_file_values_external" UNIQUE("external_source","external_id")
);
--> statement-breakpoint
CREATE TABLE "attribute_numeric_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attribute_numeric_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attribute_id" integer NOT NULL,
	"organization_id" integer,
	"value" numeric(20,6) NOT NULL,
	"external_source" varchar(100),
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_numeric_values_external" UNIQUE("external_source","external_id")
);
--> statement-breakpoint
CREATE TABLE "attribute_reference_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attribute_reference_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attribute_id" integer NOT NULL,
	"organization_id" integer,
	"slug" varchar(255) NOT NULL,
	"value" varchar(255) NOT NULL,
	"reference_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"external_source" varchar(100),
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_reference_slug" UNIQUE("attribute_id","slug"),
	CONSTRAINT "uq_reference_id" UNIQUE("attribute_id","reference_id"),
	CONSTRAINT "uq_reference_values_external" UNIQUE("external_source","external_id")
);
--> statement-breakpoint
CREATE TABLE "attribute_swatch_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attribute_swatch_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attribute_id" integer NOT NULL,
	"organization_id" integer,
	"slug" varchar(255) NOT NULL,
	"value" varchar(255) NOT NULL,
	"color" varchar(7),
	"file_url" varchar(2048),
	"mimetype" varchar(100),
	"position" integer DEFAULT 0 NOT NULL,
	"external_source" varchar(100),
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_swatch_slug" UNIQUE("attribute_id","slug"),
	CONSTRAINT "uq_swatch_values_external" UNIQUE("external_source","external_id"),
	CONSTRAINT "chk_swatch_has_visual" CHECK ("color" IS NOT NULL OR "file_url" IS NOT NULL),
	CONSTRAINT "chk_swatch_mimetype" CHECK ("file_url" IS NULL OR "mimetype" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "attribute_text_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attribute_text_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attribute_id" integer NOT NULL,
	"organization_id" integer,
	"plain" text NOT NULL,
	"rich" jsonb,
	"external_source" varchar(100),
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_text_values_external" UNIQUE("external_source","external_id")
);
--> statement-breakpoint
CREATE TABLE "attribute_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attribute_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attribute_id" integer NOT NULL,
	"organization_id" integer,
	"slug" varchar(255) NOT NULL,
	"value" varchar(255) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"external_source" varchar(100),
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_attribute_value_slug" UNIQUE("attribute_id","slug"),
	CONSTRAINT "uq_attribute_values_external" UNIQUE("external_source","external_id")
);
--> statement-breakpoint
CREATE TABLE "attributes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attributes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL CONSTRAINT "uq_attributes_slug" UNIQUE,
	"type" "attribute_type" NOT NULL,
	"reference_entity" varchar(100),
	"unit" "attribute_unit",
	"is_required" boolean DEFAULT false NOT NULL,
	"is_filterable" boolean DEFAULT false NOT NULL,
	"external_source" varchar(100),
	"external_id" varchar(255),
	"metadata" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_attributes_external" UNIQUE("external_source","external_id"),
	CONSTRAINT "chk_reference_entity" CHECK (("type" = 'REFERENCE' AND "reference_entity" IS NOT NULL) OR ("type" <> 'REFERENCE' AND "reference_entity" IS NULL)),
	CONSTRAINT "chk_unit_for_numeric" CHECK ("type" = 'NUMERIC' OR "unit" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "channel_stock_locations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "channel_stock_locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"channel_id" integer NOT NULL,
	"stock_location_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channel_stock_locations_uniq" UNIQUE("channel_id","stock_location_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "channels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channels_org_handle_uniq" UNIQUE("organization_id","handle")
);
--> statement-breakpoint
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
CREATE TABLE "inventory_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventory_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"sku" text NOT NULL,
	"title" text,
	"description" text,
	"requires_shipping" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_org_sku_uniq" UNIQUE("organization_id","sku")
);
--> statement-breakpoint
CREATE TABLE "inventory_levels" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventory_levels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"inventory_item_id" integer NOT NULL,
	"stock_location_id" integer NOT NULL,
	"stocked_quantity" integer DEFAULT 0 NOT NULL,
	"reserved_quantity" integer DEFAULT 0 NOT NULL,
	"incoming_quantity" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_inv_level_stocked_nonneg" CHECK ("stocked_quantity" >= 0),
	CONSTRAINT "chk_inv_level_reserved_nonneg" CHECK ("reserved_quantity" >= 0),
	CONSTRAINT "chk_inv_level_incoming_nonneg" CHECK ("incoming_quantity" >= 0),
	CONSTRAINT "chk_inv_level_reserved_le_stocked" CHECK ("reserved_quantity" <= "stocked_quantity")
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventory_reservations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"inventory_item_id" integer NOT NULL,
	"stock_location_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_item_id" text,
	"description" text,
	"created_by" integer,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_inv_reservation_qty_pos" CHECK ("quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer,
	"parent_id" integer,
	"name" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_translations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "category_translations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category_id" integer NOT NULL,
	"locale_code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "category_translations_uniq" UNIQUE("category_id","locale_code")
);
--> statement-breakpoint
CREATE TABLE "collection_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "collection_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"collection_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	CONSTRAINT "collection_products_uniq" UNIQUE("collection_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "collection_translations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "collection_translations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"collection_id" integer NOT NULL,
	"locale_code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "collection_translations_uniq" UNIQUE("collection_id","locale_code")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "collections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_attribute_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_attribute_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"organization_id" integer,
	"attribute_id" integer NOT NULL,
	"value_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"organization_id" integer
);
--> statement-breakpoint
CREATE TABLE "product_channel_listings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_channel_listings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"organization_id" integer,
	"is_published" boolean DEFAULT false NOT NULL,
	"visible_in_listings" boolean DEFAULT true NOT NULL,
	"available_for_purchase_at" timestamp,
	"published_at" timestamp,
	"review_state" "product_listing_review_state" DEFAULT 'approved'::"product_listing_review_state" NOT NULL,
	"reviewed_at" timestamp,
	"review_reason" text,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_media_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"organization_id" integer,
	"url" text NOT NULL,
	"alt" text,
	"type" "product_media_type" DEFAULT 'IMAGE'::"product_media_type" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_org_adoptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_org_adoptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"adopted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_translations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_translations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"locale_code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "product_translations_uniq" UNIQUE("product_id","locale_code")
);
--> statement-breakpoint
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
CREATE TABLE "taxonomy_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "taxonomy_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "taxonomy_request_kind" NOT NULL,
	"entity_type" "taxonomy_entity_type" NOT NULL,
	"organization_id" integer NOT NULL,
	"payload" jsonb,
	"target_id" integer,
	"state" "taxonomy_request_state" DEFAULT 'pending'::"taxonomy_request_state" NOT NULL,
	"review_reason" text,
	"reviewed_at" timestamp,
	"result_id" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_attribute_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variant_attribute_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"variant_id" integer NOT NULL,
	"organization_id" integer,
	"attribute_id" integer NOT NULL,
	"value_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_inventory_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variant_inventory_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"variant_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"inventory_item_id" integer NOT NULL,
	"required_quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "variant_inventory_items_uniq" UNIQUE("variant_id","organization_id","inventory_item_id"),
	CONSTRAINT "chk_vii_required_qty_pos" CHECK ("required_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "variant_media" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variant_media_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"variant_id" integer NOT NULL,
	"media_id" integer NOT NULL,
	CONSTRAINT "variant_media_uniq" UNIQUE("variant_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "variant_price_sets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variant_price_sets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"variant_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"price_set_id" integer NOT NULL,
	CONSTRAINT "variant_price_sets_uniq" UNIQUE("variant_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "variant_translations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variant_translations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"variant_id" integer NOT NULL,
	"locale_code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "variant_translations_uniq" UNIQUE("variant_id","locale_code")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "locales_code_uniq" ON "locales" ("code") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "locales_active_idx" ON "locales" ("is_active");--> statement-breakpoint
CREATE INDEX "idx_reference_values_attr" ON "attribute_reference_values" ("attribute_id","position");--> statement-breakpoint
CREATE INDEX "idx_swatch_values_attr" ON "attribute_swatch_values" ("attribute_id","position");--> statement-breakpoint
CREATE INDEX "idx_attribute_values_attr" ON "attribute_values" ("attribute_id","position");--> statement-breakpoint
CREATE INDEX "idx_attributes_name_trgm" ON "attributes" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_attributes_slug_trgm" ON "attributes" USING gin ("slug" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_attributes_type" ON "attributes" ("type");--> statement-breakpoint
CREATE INDEX "idx_attributes_filterable" ON "attributes" ("is_filterable") WHERE "is_filterable" = TRUE;--> statement-breakpoint
CREATE INDEX "idx_attributes_org" ON "attributes" ("organization_id");--> statement-breakpoint
CREATE INDEX "channel_stock_locations_channel_id_idx" ON "channel_stock_locations" ("channel_id");--> statement-breakpoint
CREATE INDEX "channels_organization_id_idx" ON "channels" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_platform_handle_uniq" ON "channels" ("handle") WHERE organization_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_rules_list_attr_uniq" ON "price_list_rules" ("price_list_id","attribute") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "price_list_rules_list_id_idx" ON "price_list_rules" ("price_list_id");--> statement-breakpoint
CREATE INDEX "price_lists_organization_id_idx" ON "price_lists" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_rules_price_attr_uniq" ON "price_rules" ("price_id","attribute") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "price_rules_price_id_idx" ON "price_rules" ("price_id");--> statement-breakpoint
CREATE INDEX "price_sets_organization_id_idx" ON "price_sets" ("organization_id");--> statement-breakpoint
CREATE INDEX "prices_price_set_id_idx" ON "prices" ("price_set_id");--> statement-breakpoint
CREATE INDEX "prices_price_list_id_idx" ON "prices" ("price_list_id");--> statement-breakpoint
CREATE INDEX "prices_set_currency_idx" ON "prices" ("price_set_id","currency_code");--> statement-breakpoint
CREATE INDEX "inventory_items_organization_id_idx" ON "inventory_items" ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_levels_item_id_idx" ON "inventory_levels" ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "inventory_levels_stock_location_id_idx" ON "inventory_levels" ("stock_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_levels_item_loc_uniq" ON "inventory_levels" ("inventory_item_id","stock_location_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "inventory_reservations_item_id_idx" ON "inventory_reservations" ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_stock_location_id_idx" ON "inventory_reservations" ("stock_location_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_line_item_id_idx" ON "inventory_reservations" ("line_item_id");--> statement-breakpoint
CREATE INDEX "categories_org_idx" ON "categories" ("organization_id");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_slug_uniq" ON "categories" ("organization_id","slug") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "collection_products_product_idx" ON "collection_products" ("product_id");--> statement-breakpoint
CREATE INDEX "collections_org_idx" ON "collections" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_org_slug_uniq" ON "collections" ("organization_id","slug") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "product_attribute_values_product_idx" ON "product_attribute_values" ("product_id");--> statement-breakpoint
CREATE INDEX "product_attribute_values_lookup_idx" ON "product_attribute_values" ("product_id","organization_id","attribute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_base_uniq" ON "product_categories" ("product_id","category_id") WHERE "organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_org_uniq" ON "product_categories" ("product_id","category_id","organization_id") WHERE "organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "product_categories_category_idx" ON "product_categories" ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_channel_listings_uniq" ON "product_channel_listings" ("product_id","channel_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "product_channel_listings_channel_idx" ON "product_channel_listings" ("channel_id");--> statement-breakpoint
CREATE INDEX "product_media_product_idx" ON "product_media" ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_org_adoptions_uniq" ON "product_org_adoptions" ("product_id","organization_id");--> statement-breakpoint
CREATE INDEX "product_org_adoptions_org_idx" ON "product_org_adoptions" ("organization_id");--> statement-breakpoint
CREATE INDEX "product_type_attributes_type_idx" ON "product_type_attributes" ("product_type_id");--> statement-breakpoint
CREATE INDEX "product_types_org_idx" ON "product_types" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_types_org_slug_uniq" ON "product_types" ("organization_id","slug") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_org_sku_uniq" ON "product_variants" ("organization_id","sku") WHERE "sku" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "products_org_idx" ON "products" ("organization_id");--> statement-breakpoint
CREATE INDEX "products_type_idx" ON "products" ("product_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_handle_uniq" ON "products" ("organization_id","handle") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "taxonomy_requests_state_idx" ON "taxonomy_requests" ("state");--> statement-breakpoint
CREATE INDEX "taxonomy_requests_org_idx" ON "taxonomy_requests" ("organization_id");--> statement-breakpoint
CREATE INDEX "variant_attribute_values_variant_idx" ON "variant_attribute_values" ("variant_id");--> statement-breakpoint
CREATE INDEX "variant_attribute_values_lookup_idx" ON "variant_attribute_values" ("variant_id","organization_id","attribute_id");--> statement-breakpoint
CREATE INDEX "variant_inventory_items_variant_idx" ON "variant_inventory_items" ("variant_id","organization_id");--> statement-breakpoint
CREATE INDEX "variant_media_media_idx" ON "variant_media" ("media_id");--> statement-breakpoint
CREATE INDEX "variant_price_sets_price_set_idx" ON "variant_price_sets" ("price_set_id");--> statement-breakpoint
ALTER TABLE "attribute_boolean_values" ADD CONSTRAINT "attribute_boolean_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_date_values" ADD CONSTRAINT "attribute_date_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_file_values" ADD CONSTRAINT "attribute_file_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_numeric_values" ADD CONSTRAINT "attribute_numeric_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_reference_values" ADD CONSTRAINT "attribute_reference_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_swatch_values" ADD CONSTRAINT "attribute_swatch_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_text_values" ADD CONSTRAINT "attribute_text_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "channel_stock_locations" ADD CONSTRAINT "channel_stock_locations_channel_id_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "price_list_rules" ADD CONSTRAINT "price_list_rules_price_list_id_price_lists_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_price_id_prices_id_fkey" FOREIGN KEY ("price_id") REFERENCES "prices"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_price_set_id_price_sets_id_fkey" FOREIGN KEY ("price_set_id") REFERENCES "price_sets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_price_list_id_price_lists_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_inventory_item_id_inventory_items_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_UGQwDJNi4QN3_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_collections_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_translations" ADD CONSTRAINT "collection_translations_collection_id_collections_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_channel_listings" ADD CONSTRAINT "product_channel_listings_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_org_adoptions" ADD CONSTRAINT "product_org_adoptions_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_type_attributes" ADD CONSTRAINT "product_type_attributes_product_type_id_product_types_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_types"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_product_type_id_product_types_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_types"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_variant_id_product_variants_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "variant_inventory_items" ADD CONSTRAINT "variant_inventory_items_variant_id_product_variants_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "variant_media" ADD CONSTRAINT "variant_media_variant_id_product_variants_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "variant_media" ADD CONSTRAINT "variant_media_media_id_product_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "product_media"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "variant_price_sets" ADD CONSTRAINT "variant_price_sets_variant_id_product_variants_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "variant_translations" ADD CONSTRAINT "variant_translations_variant_id_product_variants_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE;