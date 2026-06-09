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
CREATE TABLE "collection_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "collection_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"collection_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	CONSTRAINT "collection_products_uniq" UNIQUE("collection_id","product_id")
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
CREATE TABLE "product_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"organization_id" integer
);
--> statement-breakpoint
CREATE INDEX "categories_org_idx" ON "categories" ("organization_id");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_slug_uniq" ON "categories" ("organization_id","slug") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "collection_products_product_idx" ON "collection_products" ("product_id");--> statement-breakpoint
CREATE INDEX "collections_org_idx" ON "collections" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_org_slug_uniq" ON "collections" ("organization_id","slug") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_base_uniq" ON "product_categories" ("product_id","category_id") WHERE "organization_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_org_uniq" ON "product_categories" ("product_id","category_id","organization_id") WHERE "organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "product_categories_category_idx" ON "product_categories" ("category_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_collections_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE;