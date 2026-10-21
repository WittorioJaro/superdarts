CREATE TABLE "room_darts" (
	"room_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"player_id" uuid NOT NULL,
	"dart" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_darts_room_id_game_id_seq_pk" PRIMARY KEY("room_id","game_id","seq")
);
--> statement-breakpoint
ALTER TABLE "room_darts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "room_players" (
	"room_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_players_room_id_player_id_pk" PRIMARY KEY("room_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "room_players" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"host_id" uuid NOT NULL,
	"status" text DEFAULT 'lobby' NOT NULL,
	"mode" text NOT NULL,
	"config" jsonb NOT NULL,
	"ranked" boolean DEFAULT false NOT NULL,
	"game_id" uuid,
	"game_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "room_darts" ADD CONSTRAINT "room_darts_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_darts" ADD CONSTRAINT "room_darts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_id_players_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_players_player_idx" ON "room_players" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "rooms_updated_at_idx" ON "rooms" USING btree ("updated_at");--> statement-breakpoint
-- Room tables deliberately have no API policies. This helper only reveals membership.
CREATE FUNCTION public.is_room_member(room_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_players rp
    JOIN public.players p ON p.id = rp.player_id
    WHERE rp.room_id = $1 AND p.user_id = (SELECT auth.uid())
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_room_member(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_room_member(uuid) TO authenticated;
--> statement-breakpoint
CREATE POLICY "room_members_receive" ON realtime.messages
FOR SELECT TO authenticated
USING (
  private AND CASE
    WHEN realtime.topic() ~ '^room:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN public.is_room_member(substring(realtime.topic() FROM 6)::uuid)
    ELSE false
  END
);
--> statement-breakpoint
-- Presence needs INSERT authorization; clients must not spoof authoritative broadcasts.
CREATE POLICY "room_members_presence" ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  private AND extension = 'presence' AND CASE
    WHEN realtime.topic() ~ '^room:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN public.is_room_member(substring(realtime.topic() FROM 6)::uuid)
    ELSE false
  END
);
--> statement-breakpoint
CREATE FUNCTION public.broadcast_room_dart()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM realtime.send(jsonb_build_object('type', 'dart', 'gameId', NEW.game_id, 'seq', NEW.seq, 'dart', NEW.dart),
      'dart', 'room:' || NEW.room_id::text, true);
    RETURN NEW;
  END IF;
  PERFORM realtime.send(jsonb_build_object('type', 'undo', 'gameId', OLD.game_id, 'seq', OLD.seq),
    'undo', 'room:' || OLD.room_id::text, true);
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER room_darts_broadcast AFTER INSERT OR DELETE ON public.room_darts
FOR EACH ROW EXECUTE FUNCTION public.broadcast_room_dart();
--> statement-breakpoint
CREATE FUNCTION public.broadcast_room_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  room_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'rooms' THEN
    room_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    room_id := OLD.room_id;
  ELSE
    room_id := NEW.room_id;
  END IF;
  PERFORM realtime.send(jsonb_build_object('type', 'room'), 'room', 'room:' || room_id::text, true);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER rooms_broadcast AFTER UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.broadcast_room_change();
--> statement-breakpoint
CREATE TRIGGER room_players_broadcast AFTER INSERT OR UPDATE OR DELETE ON public.room_players
FOR EACH ROW EXECUTE FUNCTION public.broadcast_room_change();
--> statement-breakpoint
-- Realtime's authorization probes omit `private` (its default is false), even for
-- private channels. Permit those probes too; actual room broadcasts stay private.
CREATE POLICY "room_members_receive_probe" ON realtime.messages
FOR SELECT TO authenticated
USING (
  NOT private AND extension IN ('broadcast', 'presence') AND CASE
    WHEN realtime.topic() ~ '^room:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN public.is_room_member(substring(realtime.topic() FROM 6)::uuid)
    ELSE false
  END
);
--> statement-breakpoint
CREATE POLICY "room_members_presence_probe" ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  NOT private AND extension = 'presence' AND CASE
    WHEN realtime.topic() ~ '^room:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN public.is_room_member(substring(realtime.topic() FROM 6)::uuid)
    ELSE false
  END
);
