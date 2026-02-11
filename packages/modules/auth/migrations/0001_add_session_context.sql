ALTER TABLE "session" ADD COLUMN "actor_type" text NOT NULL DEFAULT 'customer';
ALTER TABLE "session" ADD COLUMN "auth_method" text NOT NULL DEFAULT 'email';
ALTER TABLE "session" ADD COLUMN "organization_id" text;
