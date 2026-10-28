CREATE TABLE "pub_table_live" (
	"table_id" uuid PRIMARY KEY NOT NULL,
	"rev" integer NOT NULL,
	"game" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pub_table_live" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pub_table_live" ADD CONSTRAINT "pub_table_live_table_id_pub_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."pub_tables"("id") ON DELETE cascade ON UPDATE no action;