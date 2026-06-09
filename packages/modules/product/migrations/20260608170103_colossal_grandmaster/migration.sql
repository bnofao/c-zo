CREATE TABLE "product_org_adoptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_org_adoptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"adopted_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_org_adoptions_uniq" ON "product_org_adoptions" ("product_id","organization_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "product_org_adoptions_org_idx" ON "product_org_adoptions" ("organization_id");--> statement-breakpoint
ALTER TABLE "product_org_adoptions" ADD CONSTRAINT "product_org_adoptions_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;