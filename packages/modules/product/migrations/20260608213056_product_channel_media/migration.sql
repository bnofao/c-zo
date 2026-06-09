CREATE TABLE "product_channel_listings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_channel_listings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"visible_in_listings" boolean DEFAULT true NOT NULL,
	"available_for_purchase_at" timestamp,
	"published_at" timestamp,
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
CREATE TABLE "variant_media" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variant_media_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"variant_id" integer NOT NULL,
	"media_id" integer NOT NULL,
	CONSTRAINT "variant_media_uniq" UNIQUE("variant_id","media_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_channel_listings_uniq" ON "product_channel_listings" ("product_id","channel_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "product_channel_listings_channel_idx" ON "product_channel_listings" ("channel_id");--> statement-breakpoint
CREATE INDEX "product_media_product_idx" ON "product_media" ("product_id");--> statement-breakpoint
CREATE INDEX "variant_media_media_idx" ON "variant_media" ("media_id");--> statement-breakpoint
ALTER TABLE "product_channel_listings" ADD CONSTRAINT "product_channel_listings_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "variant_media" ADD CONSTRAINT "variant_media_variant_id_product_variants_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "variant_media" ADD CONSTRAINT "variant_media_media_id_product_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "product_media"("id") ON DELETE CASCADE;