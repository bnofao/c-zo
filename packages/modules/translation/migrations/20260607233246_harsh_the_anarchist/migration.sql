CREATE TABLE "locales" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "locales_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "locales_code_uniq" ON "locales" ("code") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "locales_active_idx" ON "locales" ("is_active");
--> statement-breakpoint
INSERT INTO "locales" ("code", "name", "is_active") VALUES ('en', 'English', true);