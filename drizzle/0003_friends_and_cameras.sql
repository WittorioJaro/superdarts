-- No table changes: presence and invites use Supabase's private realtime topics.
CREATE FUNCTION public.is_player()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.players p WHERE p.user_id = (SELECT auth.uid()));
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_player() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_player() TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.owns_player(player_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.players p WHERE p.id = $1 AND p.user_id = (SELECT auth.uid()));
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.owns_player(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.owns_player(uuid) TO authenticated;
--> statement-breakpoint
CREATE POLICY "friends_receive_presence" ON realtime.messages
FOR SELECT TO authenticated
USING (private AND extension = 'presence' AND realtime.topic() = 'friends' AND (SELECT public.is_player()));
--> statement-breakpoint
CREATE POLICY "friends_send_presence" ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (private AND extension = 'presence' AND realtime.topic() = 'friends' AND (SELECT public.is_player()));
--> statement-breakpoint
CREATE POLICY "player_receive_invites" ON realtime.messages
FOR SELECT TO authenticated
USING (
  private AND extension = 'broadcast' AND CASE
    WHEN realtime.topic() ~ '^player:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN public.owns_player(substring(realtime.topic() FROM 8)::uuid)
    ELSE false
  END
);
--> statement-breakpoint
-- As in 0002, Realtime's authorization probes omit private (default false).
-- These grant only the same topic/extension permissions as the private policies.
CREATE POLICY "friends_receive_presence_probe" ON realtime.messages
FOR SELECT TO authenticated
USING (NOT private AND extension = 'presence' AND realtime.topic() = 'friends' AND (SELECT public.is_player()));
--> statement-breakpoint
CREATE POLICY "friends_send_presence_probe" ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (NOT private AND extension = 'presence' AND realtime.topic() = 'friends' AND (SELECT public.is_player()));
--> statement-breakpoint
CREATE POLICY "player_receive_invites_probe" ON realtime.messages
FOR SELECT TO authenticated
USING (
  NOT private AND extension = 'broadcast' AND CASE
    WHEN realtime.topic() ~ '^player:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN public.owns_player(substring(realtime.topic() FROM 8)::uuid)
    ELSE false
  END
);
