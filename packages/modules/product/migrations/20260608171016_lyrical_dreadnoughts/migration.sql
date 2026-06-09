CREATE TABLE "product_attribute_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_attribute_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"organization_id" integer,
	"attribute_id" integer NOT NULL,
	"value_kind" "product_value_kind" NOT NULL,
	"value_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_attribute_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variant_attribute_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"variant_id" integer NOT NULL,
	"organization_id" integer,
	"attribute_id" integer NOT NULL,
	"value_kind" "product_value_kind" NOT NULL,
	"value_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "product_attribute_values_product_idx" ON "product_attribute_values" ("product_id");--> statement-breakpoint
CREATE INDEX "product_attribute_values_lookup_idx" ON "product_attribute_values" ("product_id","organization_id","attribute_id");--> statement-breakpoint
CREATE INDEX "variant_attribute_values_variant_idx" ON "variant_attribute_values" ("variant_id");--> statement-breakpoint
CREATE INDEX "variant_attribute_values_lookup_idx" ON "variant_attribute_values" ("variant_id","organization_id","attribute_id");--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_variant_id_product_variants_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE;