CREATE TYPE "taxonomy_entity_type" AS ENUM('category', 'product_type');--> statement-breakpoint
CREATE TYPE "taxonomy_request_kind" AS ENUM('create', 'promote');--> statement-breakpoint
CREATE TYPE "taxonomy_request_state" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "taxonomy_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "taxonomy_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "taxonomy_request_kind" NOT NULL,
	"entity_type" "taxonomy_entity_type" NOT NULL,
	"organization_id" integer NOT NULL,
	"payload" jsonb,
	"target_id" integer,
	"state" "taxonomy_request_state" DEFAULT 'pending'::"taxonomy_request_state" NOT NULL,
	"review_reason" text,
	"reviewed_at" timestamp,
	"result_id" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "taxonomy_requests_state_idx" ON "taxonomy_requests" ("state");--> statement-breakpoint
CREATE INDEX "taxonomy_requests_org_idx" ON "taxonomy_requests" ("organization_id");