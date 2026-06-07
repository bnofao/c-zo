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
CREATE INDEX "inventory_items_organization_id_idx" ON "inventory_items" ("organization_id");--> statement-breakpoint
CREATE INDEX "inventory_levels_item_id_idx" ON "inventory_levels" ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "inventory_levels_stock_location_id_idx" ON "inventory_levels" ("stock_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_levels_item_loc_uniq" ON "inventory_levels" ("inventory_item_id","stock_location_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "inventory_reservations_item_id_idx" ON "inventory_reservations" ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_stock_location_id_idx" ON "inventory_reservations" ("stock_location_id");--> statement-breakpoint
CREATE INDEX "inventory_reservations_line_item_id_idx" ON "inventory_reservations" ("line_item_id");--> statement-breakpoint
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_inventory_item_id_inventory_items_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_UGQwDJNi4QN3_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE;