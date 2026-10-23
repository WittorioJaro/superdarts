CREATE TABLE "pub_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"player_ids" jsonb NOT NULL,
	"code" text,
	"code_expires_at" timestamp with time zone NOT NULL,
	"token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "pub_tables_code_unique" UNIQUE("code"),
	CONSTRAINT "pub_tables_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "pub_tables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pub_tables" ADD CONSTRAINT "pub_tables_host_id_players_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pub_tables_host_idx" ON "pub_tables" USING btree ("host_id");