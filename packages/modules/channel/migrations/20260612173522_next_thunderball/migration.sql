ALTER TABLE "channels" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "channels_platform_handle_uniq" ON "channels" ("handle") WHERE organization_id IS NULL;