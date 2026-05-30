CREATE TABLE "accounts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp(6) with time zone,
	"refresh_token_expires_at" timestamp(6) with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp(6) with time zone NOT NULL,
	"updated_at" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikeys" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "apikeys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"config_id" text NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"reference_id" integer NOT NULL,
	"reference" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp(6) with time zone,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"permissions" jsonb,
	"metadata" jsonb,
	"last_request" timestamp(6) with time zone,
	"expires_at" timestamp(6) with time zone,
	"created_at" timestamp(6) with time zone NOT NULL,
	"updated_at" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invitations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text NOT NULL,
	"expires_at" timestamp(6) with time zone NOT NULL,
	"inviter_id" integer NOT NULL,
	"created_at" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organizations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"logo" text,
	"metadata" text,
	"type" text,
	"created_at" timestamp(6) with time zone NOT NULL,
	"updated_at" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"token" text NOT NULL UNIQUE,
	"ip_address" text,
	"user_agent" text,
	"actor_type" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text,
	"parent_token" text,
	"expires_at" timestamp(6) with time zone NOT NULL,
	"created_at" timestamp(6) with time zone NOT NULL,
	"updated_at" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "two_factors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean,
	"role" text,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp(6) with time zone,
	"created_at" timestamp(6) with time zone NOT NULL,
	"updated_at" timestamp(6) with time zone NOT NULL,
	"deleted_at" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp(6) with time zone NOT NULL,
	"created_at" timestamp(6) with time zone NOT NULL,
	"updated_at" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "apikey_reference_id_idx" ON "apikeys" ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_config_id_idx" ON "apikeys" ("config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_org_email_pending_uniq" ON "invitations" ("organization_id","email") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_sessions_parent_token" ON "sessions" ("parent_token") WHERE "parent_token" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_parent_token_sessions_token_fkey" FOREIGN KEY ("parent_token") REFERENCES "sessions"("token") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;