# Superdarts

A darts scorer, practice tool and stats tracker for a group of friends. It's built for an iPad on the wall next to the board, installed to the home screen as a web app.

- **Practice**: free throw, solo X01, checkouts, doubles, around the clock, Bob's 27 and Shanghai.
- **Match**: X01 (301/501/701) on one device. Pick the players, legs or sets, and double, master or straight out. Every dart counts on each player's profile.
- **Online**: not built yet. Private rooms with cameras come next.
- **Profiles**: 3-dart and first-9 averages, checkout rate, hit rate on each double, 180s/140+/100+, best leg, where your darts land on the board, match form, and personal bests for each drill. You can filter by matches or practice, and by the last 30 days.

Stack: Next.js 16 (App Router), Supabase Auth (Google), Postgres with Drizzle, Tailwind 4.

## How it works

You enter one dart per tap. A game is just a list of darts. The engine in `src/lib/darts` replays that list to get the scoreboard, so undo means replaying one dart fewer.

The game in progress is stored on the device (`localStorage`). A dropped connection or a closed app never loses darts. When a game ends it goes into a save queue, and the server replays the same darts to work out the stats it stores. If you're offline, the home screen sends queued games once you're back online. Saves are idempotent.

```
src/lib/darts/        game engine, checkout routes, stats (pure TS, unit tested)
src/app/play/         the counter: pad, scoreboards, end-of-game summary
src/app/practice/     drill picker
src/app/match/        player and format picker
src/app/players/      player list and profile stats
src/app/actions.ts    server actions (save game, add guest, edit profile)
src/db/schema.ts      Drizzle schema
```

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **Google OAuth**: in Google Cloud Console, create an OAuth client of type *Web application*. Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI.
3. In Supabase, go to **Authentication → Sign In / Providers → Google**. Enable it and paste the client ID and secret.
4. In Supabase, go to **Authentication → URL Configuration**:
   - Site URL: your deployed URL, e.g. `https://superdarts.vercel.app`
   - Redirect URLs: `https://superdarts.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in the Supabase URL, the publishable key and the database connection strings. Find them in the Supabase dashboard under **Connect**. Set `ALLOWED_EMAILS` to your group's Google addresses to restrict sign-in; leaving it empty allows anyone with a Google account. Set `ADMIN_EMAILS=wiktor.jaro@gmail.com` (comma-separated for multiple admins). Admins are always allowed to sign in and can add or revoke invited Google addresses from the Invites section on their own profile. Invites also grant access when `ALLOWED_EMAILS` is restricted; revoking an invite does not override either environment list. No email is sent: copy the invite message and share it yourself.

If the Google OAuth consent screen is in **Testing** mode, invitees must also be added as test users in Google Cloud. App invites do not bypass that restriction.

### 3. Database

```bash
pnpm install
pnpm db:migrate
```

This creates the tables with row-level security turned on and no policies. The app talks to Postgres directly through Drizzle, so turning on RLS only closes Supabase's public REST API to these tables.

### 4. Run

```bash
pnpm dev
```

### 5. Deploy

Deploy to Vercel or any Node host and set the same environment variables. Then open the site in Safari on the iPad, tap **Share → Add to Home Screen**, and sign in once. The session lasts until you sign out.

## Local Supabase (optional)

`supabase start` runs a local stack on ports 55421 (API) and 55422 (Postgres). These are set in `supabase/config.toml` so they don't clash with other projects. Google sign-in only works locally if you add Google credentials to that config, so the simplest option is to point `.env.local` at your hosted project.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm test` | Engine and stats unit tests |
| `pnpm typecheck` | Route types + TypeScript |
| `pnpm db:generate` | New migration after editing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Browse the database |
