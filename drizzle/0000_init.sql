CREATE TABLE "darts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "darts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"turn_seq" integer NOT NULL,
	"idx" smallint NOT NULL,
	"segment" smallint NOT NULL,
	"multiplier" smallint NOT NULL,
	"score" smallint NOT NULL,
	"target" smallint,
	"hit" boolean,
	"at_double" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "darts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game_players" (
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"winner" boolean DEFAULT false NOT NULL,
	"score" real NOT NULL,
	"legs_won" smallint DEFAULT 0 NOT NULL,
	"sets_won" smallint DEFAULT 0 NOT NULL,
	"darts_thrown" integer NOT NULL,
	"points" integer NOT NULL,
	"average" real,
	CONSTRAINT "game_players_game_id_player_id_pk" PRIMARY KEY("game_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "game_players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" text NOT NULL,
	"winner_id" uuid,
	"created_by" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"darts" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"avatar_url" text,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "turns" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "turns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"set" smallint NOT NULL,
	"leg" smallint NOT NULL,
	"visit" smallint NOT NULL,
	"points" integer NOT NULL,
	"darts_thrown" smallint NOT NULL,
	"start_score" integer,
	"bust" boolean NOT NULL,
	"checkout" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "darts" ADD CONSTRAINT "darts_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "darts" ADD CONSTRAINT "darts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_winner_id_players_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_created_by_players_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "darts_player_idx" ON "darts" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "darts_game_idx" ON "darts" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_players_player_idx" ON "game_players" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "games_finished_at_idx" ON "games" USING btree ("finished_at");--> statement-breakpoint
CREATE INDEX "turns_player_idx" ON "turns" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "turns_game_idx" ON "turns" USING btree ("game_id");