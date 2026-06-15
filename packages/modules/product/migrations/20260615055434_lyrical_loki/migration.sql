CREATE TYPE "product_listing_review_state" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
ALTER TABLE "product_channel_listings" ADD COLUMN "review_state" "product_listing_review_state" DEFAULT 'approved'::"product_listing_review_state" NOT NULL;--> statement-breakpoint
ALTER TABLE "product_channel_listings" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "product_channel_listings" ADD COLUMN "review_reason" text;