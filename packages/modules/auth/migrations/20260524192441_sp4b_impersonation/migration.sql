ALTER TABLE "sessions" ADD COLUMN "parent_token" text;--> statement-breakpoint
CREATE INDEX "idx_sessions_parent_token" ON "sessions" ("parent_token") WHERE "parent_token" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_parent_token_sessions_token_fkey" FOREIGN KEY ("parent_token") REFERENCES "sessions"("token") ON DELETE CASCADE;