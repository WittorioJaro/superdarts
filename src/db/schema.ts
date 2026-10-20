import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Every table enables RLS without policies. The app talks to Postgres directly
// through Drizzle, so this only closes off Supabase's public REST API.

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Supabase auth user. Null for guests added from the player list. */
    userId: uuid("user_id").unique(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    color: text("color").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
).enableRLS();

export const games = pgTable(
  "games",
  {
    /** Generated on the device when the game starts, so a retried save can't duplicate it. */
    id: uuid("id").primaryKey(),
    kind: text("kind", { enum: ["practice", "match"] }).notNull(),
    mode: text("mode").notNull(),
    config: jsonb("config").notNull(),
    /** `finished` played to the end; `stopped` was ended early (practice only). */
    status: text("status", { enum: ["finished", "stopped"] }).notNull(),
    winnerId: uuid("winner_id").references(() => players.id),
    createdBy: uuid("created_by").references(() => players.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
    /** The raw dart sequence. Everything else in the database can be rebuilt from it. */
    darts: jsonb("darts").notNull(),
  },
  (t) => [index("games_finished_at_idx").on(t.finishedAt)],
).enableRLS();

export const gamePlayers = pgTable(
  "game_players",
  {
    gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => players.id),
    position: smallint("position").notNull(),
    winner: boolean("winner").notNull().default(false),
    score: real("score").notNull(),
    legsWon: smallint("legs_won").notNull().default(0),
    setsWon: smallint("sets_won").notNull().default(0),
    dartsThrown: integer("darts_thrown").notNull(),
    points: integer("points").notNull(),
    average: real("average"),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.playerId] }), index("game_players_player_idx").on(t.playerId)],
).enableRLS();

export const turns = pgTable(
  "turns",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => players.id),
    seq: integer("seq").notNull(),
    set: smallint("set").notNull(),
    leg: smallint("leg").notNull(),
    visit: smallint("visit").notNull(),
    points: integer("points").notNull(),
    dartsThrown: smallint("darts_thrown").notNull(),
    startScore: integer("start_score"),
    bust: boolean("bust").notNull(),
    checkout: boolean("checkout").notNull(),
  },
  (t) => [index("turns_player_idx").on(t.playerId), index("turns_game_idx").on(t.gameId)],
).enableRLS();

export const darts = pgTable(
  "darts",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => players.id),
    turnSeq: integer("turn_seq").notNull(),
    idx: smallint("idx").notNull(),
    segment: smallint("segment").notNull(),
    multiplier: smallint("multiplier").notNull(),
    score: smallint("score").notNull(),
    target: smallint("target"),
    hit: boolean("hit"),
    atDouble: boolean("at_double").notNull(),
  },
  (t) => [index("darts_player_idx").on(t.playerId), index("darts_game_idx").on(t.gameId)],
).enableRLS();

export const playersRelations = relations(players, ({ many }) => ({
  games: many(gamePlayers),
}));

export const gamesRelations = relations(games, ({ many, one }) => ({
  players: many(gamePlayers),
  winner: one(players, { fields: [games.winnerId], references: [players.id] }),
}));

export const gamePlayersRelations = relations(gamePlayers, ({ one }) => ({
  game: one(games, { fields: [gamePlayers.gameId], references: [games.id] }),
  player: one(players, { fields: [gamePlayers.playerId], references: [players.id] }),
}));

export type Player = typeof players.$inferSelect;
export type Game = typeof games.$inferSelect;
