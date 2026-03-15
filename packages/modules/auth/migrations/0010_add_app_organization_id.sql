ALTER TABLE "apps" ADD COLUMN "organization_id" text REFERENCES "organizations"("id");
CREATE INDEX "apps_organization_id_idx" ON "apps" ("organization_id");
