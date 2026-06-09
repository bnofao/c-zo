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
CREATE TABLE "variant_price_sets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variant_price_sets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"variant_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"price_set_id" integer NOT NULL,
	CONSTRAINT "variant_price_sets_uniq" UNIQUE("variant_id","organization_id")
);
--> statement-breakpoint
CREATE INDEX "variant_inventory_items_variant_idx" ON "variant_inventory_items" ("variant_id","organization_id");--> statement-breakpoint
CREATE INDEX "variant_price_sets_price_set_idx" ON "variant_price_sets" ("price_set_id");--> statement-breakpoint
ALTER TABLE "variant_inventory_items" ADD CONSTRAINT "variant_inventory_items_variant_id_product_variants_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "variant_price_sets" ADD CONSTRAINT "variant_price_sets_variant_id_product_variants_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE;