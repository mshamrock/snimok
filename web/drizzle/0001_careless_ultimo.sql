ALTER TABLE "captures" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "captures" ADD COLUMN "device_id" text;--> statement-breakpoint
CREATE INDEX "captures_device_created_idx" ON "captures" USING btree ("device_id","created_at");