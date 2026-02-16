ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;

CREATE TABLE "two_factor" (
  "id" text PRIMARY KEY NOT NULL,
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE
);
