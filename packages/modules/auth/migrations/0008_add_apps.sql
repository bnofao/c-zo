CREATE TABLE "apps" (
  "id" text PRIMARY KEY NOT NULL,
  "app_id" text NOT NULL UNIQUE,
  "manifest" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "installed_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "app_id" text NOT NULL REFERENCES "apps"("id"),
  "event" text NOT NULL,
  "payload" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer DEFAULT 0,
  "last_attempt_at" timestamp,
  "response_code" integer,
  "response_body" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_app_id_idx" ON "webhook_deliveries" ("app_id");
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries" ("status");
--> statement-breakpoint
ALTER TABLE "apikeys" ADD COLUMN "installed_app_id" text REFERENCES "apps"("id") ON DELETE CASCADE;
