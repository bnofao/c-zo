ALTER TABLE "users" ADD COLUMN "role" text NOT NULL DEFAULT 'user';
ALTER TABLE "users" ADD COLUMN "banned" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "ban_reason" text;
ALTER TABLE "users" ADD COLUMN "ban_expires" timestamp;

ALTER TABLE "sessions" ADD COLUMN "impersonated_by" text;
