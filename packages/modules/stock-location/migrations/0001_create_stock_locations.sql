CREATE TABLE "stock_locations" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "handle" text NOT NULL,
  "name" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb,
  "deleted_at" timestamp,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "stock_locations_org_handle_uniq" UNIQUE("organization_id", "handle")
);

CREATE TABLE "stock_location_addresses" (
  "id" text PRIMARY KEY NOT NULL,
  "stock_location_id" text NOT NULL REFERENCES "stock_locations"("id") ON DELETE CASCADE,
  "address_line_1" text NOT NULL,
  "address_line_2" text,
  "city" text NOT NULL,
  "province" text,
  "postal_code" text,
  "country_code" text NOT NULL,
  "phone" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "stock_location_addresses_stock_location_id_unique" UNIQUE("stock_location_id")
);

CREATE INDEX "stock_locations_organization_id_idx" ON "stock_locations" ("organization_id");
