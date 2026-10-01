CREATE TABLE "device_links" (
	"device_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "watermark" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "device_links" ADD CONSTRAINT "device_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_links_user_idx" ON "device_links" USING btree ("user_id");