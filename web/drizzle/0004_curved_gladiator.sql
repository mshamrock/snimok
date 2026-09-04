ALTER TABLE "captures" ADD COLUMN "source_id" text;--> statement-breakpoint
CREATE INDEX "captures_source_idx" ON "captures" USING btree ("user_id","source_id");