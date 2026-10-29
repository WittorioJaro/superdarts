# Superdarts

A free, self-hostable darts scorer, practice tool and stats tracker for you and your friends. Run your own instance instead of paying for a subscription.

It's built for a tablet on the wall next to the board, installed to the home screen as a web app, and it works on phones too.

## Features

- **Matches**: X01 (301/501/701) with double, master or straight out, legs and sets, and Cricket (standard and cut-throat). Play friends, guests, a bot with a set average, or a ghost of your past self.
- **Practice**: free throw, solo X01, checkout challenge, doubles, around the clock, Bob's 27, Shanghai, 121, target practice, cricket practice, a weakness trainer, and a daily 20-minute training plan built from your stats.
- **Stats**: 3-dart and first-9 averages, checkout rate, hit rate on each double, 180s/140+/100+, best leg, a board heatmap, rolling averages, personal bests per drill, achievements, and whether practice actually improves your match average.
- **Friends**: profiles, a leaderboard, head-to-head records, and Glicko-2 ratings for ranked 501.
- **Online**: private rooms with an invite link or a 4-letter code for up to 4 players, every dart synced live. You can add cameras and voice (LiveKit), and a phone can act as the board camera by scanning a QR code.
- **Pub table**: score on a shared device without signing in. You enter a one-time code from your phone.
- **Offline first**: the game in progress lives on the device, so you never lose darts. Finished games are queued and saved once you're back online.
- **The caller**: a voiced darts caller announces every visit ("ONE HUNDRED AND EIGHTYYY!"), what you need for a checkout, busts, and game shots. Turn it on and set its volume from the speaker icon.
- **Good Darts!** 🎯: score a 26 (the classic 20, 5, 1) and instead of "twenty-six" the caller laughs "GOOD DARTS!" while the scorer puts on a random show: fireworks, flames, a coronation fanfare, a pint being poured, and more.

## Stack

Next.js 16 (App Router) · React 19 · Supabase (Google auth, Postgres, Realtime) · Drizzle ORM · Tailwind 4 · LiveKit (optional) · Vitest

## How it works

You enter one dart per tap. A game is just a list of darts. The engine in `src/lib/darts` replays that list to get the scoreboard, so undo means replaying one dart fewer.

The game in progress is stored on the device (`localStorage`). When a game ends it goes into a save queue, and the server replays the same darts to work out the stats it stores. Saves are idempotent, so retrying is always safe.

```
src/lib/darts/        game engine, modes, checkout routes, stats, bot (pure TS, unit tested)
src/lib/caller*.ts    which clips to call after each visit, and the audio player
src/components/       shared UI, including the dartboard and good-darts.tsx
src/app/play/         the counter: pad, scoreboards, end-of-game summary
src/app/practice/     drill picker
src/app/match/        player and format picker
src/app/players/      player list, profiles and stats, invites
src/app/r/[code]/     online rooms
src/app/t/, table/    pub table scoring
src/db/schema.ts      Drizzle schema
drizzle/              SQL migrations, including Realtime authorization policies
scripts/              caller recording script (ElevenLabs)
public/caller/        the caller's pre-recorded clips
```

## Self-hosting

You need:

- a [Supabase](https://supabase.com) project (the free tier is plenty for a group of friends)
- a Google Cloud OAuth client, for sign-in
- somewhere to run Next.js: [Vercel](https://vercel.com) (free tier) or any Node 20+ host
- optionally, a [LiveKit](https://livekit.io) project for cameras and voice in online rooms (LiveKit Cloud has a free tier)

### 1. Supabase and Google sign-in

1. Create a project at [supabase.com](https://supabase.com).
2. In Google Cloud Console, create an OAuth client of type **Web application**. Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI.
3. In Supabase, go to **Authentication → Sign In / Providers → Google**. Enable it and paste in the client ID and secret.
4. In Supabase, go to **Authentication → URL Configuration**:
   - Site URL: your deployed URL, e.g. `https://darts.example.com`
   - Redirect URLs: `https://darts.example.com/auth/callback` and `http://localhost:3000/auth/callback`

If the Google OAuth consent screen is in **Testing** mode, everyone who signs in must also be added as a test user in Google Cloud. App invites don't get around that. Publish the consent screen if you don't want to manage test users.

### 2. Environment

```bash
cp .env.example .env.local
```

| Variable | Required | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase → Settings → API (the publishable key; the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works) |
| `DATABASE_URL` | yes | Supabase → Connect → ORMs → Drizzle, **transaction pooler** (port 6543) |
| `DIRECT_URL` | no | Direct or session connection (port 5432) for migrations. Falls back to `DATABASE_URL` |
| `ALLOWED_EMAILS` | no | Comma-separated Google addresses allowed to sign in. **Leave it empty and anyone with a Google account can sign in** |
| `ADMIN_EMAILS` | no | Comma-separated admins. They can always sign in, invite or revoke Google addresses, rename players, and delete players who haven't saved a game |
| `CONTACT_EMAIL` | no | Shown on `/privacy` and `/terms` as the address for questions and deletion requests |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | no | Turn on cameras and voice in online rooms. Without them, online play works without video |
| `ELEVENLABS_API_KEY` | no | Only needed to re-record the caller |

Admins invite people from the **Invites** section of their own profile. An invite lets someone in even when `ALLOWED_EMAILS` is set. No email is sent: copy the invite message and share it yourself.

### 3. Database

```bash
pnpm install
pnpm db:migrate
```

This creates the tables with row-level security turned on and no table policies. The app talks to Postgres directly through Drizzle, so RLS only closes Supabase's public REST API. The migrations also add the Supabase Realtime authorization policies that keep online rooms, presence and invites private to the right players.

### 4. Run locally

```bash
pnpm dev
```

Open http://localhost:3000 and sign in with Google.

### 5. Deploy

**Vercel:** import the repo, add the same environment variables, and deploy. `vercel.json` pins functions to `dub1` (Dublin). Change the region to the one closest to your Supabase database, or delete the file.

**Any Node host:** `pnpm build && pnpm start`. Set the environment variables before the build, because `NEXT_PUBLIC_*` values and the static `/privacy` and `/terms` pages are baked in at build time.

Then open the site on the tablet, add it to the home screen (Safari: **Share → Add to Home Screen**), and sign in once. The session lasts until you sign out.

### Local Supabase (optional)

`supabase start` runs a local stack on ports 55421 (API) and 55422 (Postgres), set in `supabase/config.toml` so they don't clash with other projects. Google sign-in only works locally if you add Google credentials to that config, so the easiest option is to point `.env.local` at a hosted project.

## The caller and its sounds

The caller's clips (every possible visit score, every "you require" from 2 to 170, bust, game on, game shots, "Good darts!") and the Good Darts sound effects are already recorded in `public/caller/v2`, so **you don't need an ElevenLabs account to use them**. They're generated with [ElevenLabs](https://elevenlabs.io) by `scripts/generate-caller.ts`, which holds every line's text, voice settings and delivery direction.

To re-record or change them, set `ELEVENLABS_API_KEY` in `.env.local` and run:

```bash
pnpm caller:generate --dry                          # list every line and its text
pnpm caller:generate --only score-180,require-32    # record specific lines
pnpm caller:generate --only good-darts --force      # re-record an existing one
pnpm caller:generate                                # everything not recorded yet
```

The clips are served as immutable, so if you change the voice or a line for good, bump `CALLER_VERSION` in the script and `BASE` in `src/lib/caller.ts`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm test` | Unit tests (engine, stats, actions) |
| `pnpm typecheck` | Route types + TypeScript |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | New migration after editing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Browse the database |
| `pnpm caller:generate` | Record caller clips with ElevenLabs |

## Contributing

Issues and pull requests are welcome. Run `pnpm test`, `pnpm typecheck` and `pnpm lint` before opening a PR.

## License

[MIT](LICENSE). The caller's voice clips and sound effects in `public/caller` were generated with ElevenLabs and are distributed with the project under the same license.
