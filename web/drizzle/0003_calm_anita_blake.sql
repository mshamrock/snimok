ALTER TABLE "captures" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "app" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "source_title" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "ocr_text" text;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "access_policy" text DEFAULT 'anyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;