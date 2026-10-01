CREATE TABLE "page_storage_index" (
	"page_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_storage_index_page_id_user_id_pk" PRIMARY KEY("page_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "page_storage_index_user_id_idx" ON "page_storage_index" USING btree ("user_id");