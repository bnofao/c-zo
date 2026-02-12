ALTER TABLE "user" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "session" RENAME TO "sessions";--> statement-breakpoint
ALTER TABLE "account" RENAME TO "accounts";--> statement-breakpoint
ALTER TABLE "verification" RENAME TO "verifications";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "user_email_unique" TO "users_email_unique";--> statement-breakpoint
ALTER TABLE "sessions" RENAME CONSTRAINT "session_token_unique" TO "sessions_token_unique";--> statement-breakpoint
ALTER TABLE "accounts" RENAME CONSTRAINT "account_user_id_user_id_fk" TO "accounts_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "sessions" RENAME CONSTRAINT "session_user_id_user_id_fk" TO "sessions_user_id_users_id_fk";
