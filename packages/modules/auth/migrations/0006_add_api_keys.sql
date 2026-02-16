CREATE TABLE "apikeys" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "start" text,
  "prefix" text,
  "key" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "refill_interval" integer,
  "refill_amount" integer,
  "last_refill_at" timestamp,
  "enabled" boolean NOT NULL DEFAULT true,
  "rate_limit_enabled" boolean NOT NULL DEFAULT true,
  "rate_limit_time_window" integer,
  "rate_limit_max" integer,
  "request_count" integer NOT NULL DEFAULT 0,
  "remaining" integer,
  "last_request" timestamp,
  "expires_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "permissions" text,
  "metadata" text
);

CREATE INDEX "apikey_key_idx" ON "apikeys" ("key");
CREATE INDEX "apikey_user_id_idx" ON "apikeys" ("user_id");
