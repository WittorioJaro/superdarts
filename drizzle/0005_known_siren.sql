CREATE TABLE "invites" (
	"email" text PRIMARY KEY NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_email_normalized" CHECK ("invites"."email" = lower(trim("invites"."email")))
);
--> statement-breakpoint
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_players_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;