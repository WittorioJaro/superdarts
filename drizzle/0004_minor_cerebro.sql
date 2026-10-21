DROP INDEX "darts_game_idx";--> statement-breakpoint
DROP INDEX "rating_changes_player_idx";--> statement-breakpoint
DROP INDEX "turns_game_idx";--> statement-breakpoint
CREATE INDEX "darts_game_turn_idx" ON "darts" USING btree ("game_id","turn_seq");--> statement-breakpoint
CREATE INDEX "rating_changes_player_created_idx" ON "rating_changes" USING btree ("player_id","created_at","game_id");--> statement-breakpoint
CREATE INDEX "rooms_game_idx" ON "rooms" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "turns_game_seq_idx" ON "turns" USING btree ("game_id","seq");