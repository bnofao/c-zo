ALTER TABLE "product_org_adoptions" DROP COLUMN "deleted_at";--> statement-breakpoint
ALTER TABLE "product_org_adoptions" DROP COLUMN "version";--> statement-breakpoint
DROP INDEX IF EXISTS "product_org_adoptions_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX "product_org_adoptions_uniq" ON "product_org_adoptions" ("product_id","organization_id");