CREATE TABLE "apps" (
	"id" text PRIMARY KEY,
	"app_id" text NOT NULL UNIQUE,
	"manifest" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"webhook_secret" text DEFAULT '' NOT NULL,
	"installed_by" text NOT NULL,
	"organization_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY,
	"app_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0,
	"last_attempt_at" timestamp,
	"response_code" integer,
	"response_body" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_location_addresses" (
	"id" text PRIMARY KEY,
	"stock_location_id" text NOT NULL UNIQUE,
	"address_line_1" text NOT NULL,
	"address_line_2" text,
	"city" text NOT NULL,
	"province" text,
	"postal_code" text,
	"country_code" text NOT NULL,
	"phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_locations" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_locations_org_handle_uniq" UNIQUE("organization_id","handle")
);
--> statement-breakpoint
ALTER TABLE "apikeys" ADD COLUMN "installed_app_id" text;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_app_id_idx" ON "webhook_deliveries" ("app_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries" ("status");--> statement-breakpoint
CREATE INDEX "stock_locations_organization_id_idx" ON "stock_locations" ("organization_id");--> statement-breakpoint
ALTER TABLE "apikeys" ADD CONSTRAINT "apikeys_installed_app_id_apps_id_fkey" FOREIGN KEY ("installed_app_id") REFERENCES "apps"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_installed_by_users_id_fkey" FOREIGN KEY ("installed_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_app_id_apps_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id");--> statement-breakpoint
ALTER TABLE "stock_location_addresses" ADD CONSTRAINT "stock_location_addresses_QrOjCCMMxMIc_fkey" FOREIGN KEY ("stock_location_id") REFERENCES "stock_locations"("id") ON DELETE CASCADE;