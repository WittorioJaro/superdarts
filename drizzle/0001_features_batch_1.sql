CREATE TABLE "rating_changes" (
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"before" real NOT NULL,
	"after" real NOT NULL,
	"rd_after" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_changes_game_id_player_id_pk" PRIMARY KEY("game_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "rating_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ratings" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"rating" real DEFAULT 1500 NOT NULL,
	"rd" real DEFAULT 350 NOT NULL,
	"vol" real DEFAULT 0.06 NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ratings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "darts" ADD COLUMN "thrown_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "ranked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "bot" jsonb;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "at_double" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rating_changes" ADD CONSTRAINT "rating_changes_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_changes" ADD CONSTRAINT "rating_changes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rating_changes_player_idx" ON "rating_changes" USING btree ("player_id");