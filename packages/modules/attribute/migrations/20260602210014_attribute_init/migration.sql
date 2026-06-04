CREATE TYPE "attribute_type" AS ENUM('DROPDOWN', 'MULTISELECT', 'PLAIN_TEXT', 'RICH_TEXT', 'NUMERIC', 'BOOLEAN', 'FILE', 'REFERENCE', 'SWATCH', 'DATE', 'DATE_TIME');--> statement-breakpoint
CREATE TYPE "attribute_unit" AS ENUM('KILOGRAM', 'GRAM', 'POUND', 'OUNCE', 'METER', 'CENTIMETER', 'MILLIMETER', 'INCH', 'FOOT', 'LITER', 'MILLILITER', 'GALLON', 'SQUARE_METER', 'SQUARE_CENTIMETER', 'PIECE', 'PERCENT');--> statement-breakpoint
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
CREATE INDEX "idx_reference_values_attr" ON "attribute_reference_values" ("attribute_id","position");--> statement-breakpoint
CREATE INDEX "idx_swatch_values_attr" ON "attribute_swatch_values" ("attribute_id","position");--> statement-breakpoint
CREATE INDEX "idx_attribute_values_attr" ON "attribute_values" ("attribute_id","position");--> statement-breakpoint
CREATE INDEX "idx_attributes_name_trgm" ON "attributes" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_attributes_slug_trgm" ON "attributes" USING gin ("slug" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_attributes_type" ON "attributes" ("type");--> statement-breakpoint
CREATE INDEX "idx_attributes_filterable" ON "attributes" ("is_filterable") WHERE "is_filterable" = TRUE;--> statement-breakpoint
CREATE INDEX "idx_attributes_org" ON "attributes" ("organization_id");--> statement-breakpoint
ALTER TABLE "attribute_boolean_values" ADD CONSTRAINT "attribute_boolean_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_date_values" ADD CONSTRAINT "attribute_date_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_file_values" ADD CONSTRAINT "attribute_file_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_numeric_values" ADD CONSTRAINT "attribute_numeric_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_reference_values" ADD CONSTRAINT "attribute_reference_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_swatch_values" ADD CONSTRAINT "attribute_swatch_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_text_values" ADD CONSTRAINT "attribute_text_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;