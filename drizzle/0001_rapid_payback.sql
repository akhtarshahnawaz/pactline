CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"original_name" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"extraction_status" text NOT NULL,
	"extracted_text" text,
	"extracted_characters" integer DEFAULT 0 NOT NULL,
	"extraction_metadata" jsonb,
	"extraction_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "case" ADD COLUMN "objective" text;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_case_id_idx" ON "document" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "document_sha256_idx" ON "document" USING btree ("sha256");