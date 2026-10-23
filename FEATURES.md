# Feature tracker

What Superdarts does today and what's still to build. Update this file in the same commit as the work.

✅ done · 🚧 in progress · ⬜ not started · 💤 later

## Core

| Feature | Status | Notes |
| --- | --- | --- |
| Google sign-in, invite list (`ALLOWED_EMAILS`) | ✅ | |
| iPad PWA, home screen launcher, stays signed in | ✅ | |
| Dart-by-dart entry: 1–20, Double, Treble, 25, Bull, Miss, Undo | ✅ | |
| Offline play, save queue, idempotent saves | ✅ | |
| Every dart stored (segment, ring, target, hit) | ✅ | |
| Time stamp on every dart | ✅ | Needed for fatigue and pace stats. Old games can't get one |
| Visit-total entry (type 60 instead of three darts) | ✅ | X01 only. Asks darts used and darts at a double when it matters |

## Matches

| Feature | Status | Notes |
| --- | --- | --- |
| X01 301/501/701, double/single/master out, legs and sets | ✅ | |
| Cricket | ✅ | Standard and cut-throat |
| Pub table code: score on a public device without signing in | ✅ | One-time 6-character code from your phone, valid for 10 minutes. The table lasts 12 hours or until closed. Only saves matches between the host's chosen players |
| Ranked or casual match switch | ✅ | Only ranked 501 matches change ratings |
| Play a bot with a set average | ✅ | |
| Play your past self (ghost built from your history) | ✅ | |
| Match replay, visit by visit | ✅ | |
| Darts shown on a virtual board in the replay | ✅ | |

## Practice

| Feature | Status | Notes |
| --- | --- | --- |
| Free throw (scoring practice, set number of visits) | ✅ | Covers "30 darts, maximise score" |
| Solo X01 | ✅ | |
| Around the clock (any, doubles, trebles) | ✅ | |
| Doubles training | ✅ | |
| Checkout challenge (random finishes in a range) | ✅ | |
| Bob's 27 | ✅ | |
| Shanghai | ✅ | |
| Cricket practice (close everything in the fewest darts) | ✅ | |
| 121 challenge | ✅ | |
| Target practice / T20 challenge (100 darts at one target) | ✅ | |
| Weakness trainer (your weakest targets, picked from stats) | ✅ | |
| Today's training (a 20-minute plan built from your stats) | ✅ | Simple rules, no AI |

## Stats

| Feature | Status | Notes |
| --- | --- | --- |
| 3-dart and first-9 average | ✅ | |
| Checkout rate, hit rate per double | ✅ | |
| 180s, 140+, 100+, 60+, highest visit, highest checkout, best leg | ✅ | |
| Match wins, legs, recent form | ✅ | |
| Average per game chart | ✅ | |
| Board heatmap of all scoring darts | ✅ | |
| Personal best and trend per drill | ✅ | |
| Filters: matches or practice, all time or last 30 days | ✅ | |
| Average darts per leg | ✅ | |
| Rolling average over the last 20 games | ✅ | |
| Where you miss a chosen target (left, right, high, low) | ✅ | From target practice |
| Does practice improve match results | ✅ | Practice volume against match average, by week |
| Does scoring drop as a session goes on | ✅ | Needs dart time stamps |
| Achievements and records (first 180, ton-plus checkout, streaks…) | ✅ | Computed from real games |

## Friends and competition

| Feature | Status | Notes |
| --- | --- | --- |
| Profiles for every friend, guest players | ✅ | |
| Leaderboard (average, checkout, best checkout, 180s, rating) | ✅ | Players list today shows average and wins only |
| Head-to-head (record, streak, side-by-side stats) | ✅ | |
| Glicko-2 rating for 501 | ✅ | |
| Rating history | ✅ | |

## Online

| Feature | Status | Notes |
| --- | --- | --- |
| Private online room with invite link and 4-letter code | ✅ | Supabase Realtime broadcast on a private channel; only room members receive it |
| Lobby with who's here, host starts the game | ✅ | Up to 4 players. Host throws first; rematch rotates the order |
| Live opponent scoreboard, every dart synced | ✅ | Server checks turn order. Each device only enters its own darts |
| Reconnect and carry on, darts queued while offline | ✅ | |
| Online games count for stats, ratings and replays | ✅ | Saved once the game ends, after a short window for undo |
| Works fully without cameras | ✅ | |
| App-like touch: no rubber-band scrolling, no accidental zoom | ✅ | Only the page area scrolls, and only when it's taller than the screen |
| Camera and voice in the room | ✅ | LiveKit Cloud, Frankfurt. The thrower's camera fills the screen |
| Phone as the board camera: scan a QR code on the iPad, no second login | ✅ | The iPad never uses its own camera. Link lasts 12 hours; screen stays awake |
| Choose the microphone: iPad, iPhone or off | ✅ | Your own phone's mic is never played back on your iPad |
| Online now: friends with the app open, and what they're doing | ✅ | Home screen row. One tap sends an invite to a new room |
| Room invites pop up on any screen | ✅ | Join or Not now. Also inviteable from the lobby |
| Copy link and share in the room | ✅ | Also in the in-game Leave menu |
| Groups ("The Darts Club") | 💤 | One implicit group today |

## Cameras

| Feature | Status | Notes |
| --- | --- | --- |
| Camera calibration (board centre, rings, perspective) | ✅ | Five taps on the phone (four double-wire points and the bull), then the board is drawn over the picture to check. Saved per phone and resolution |
| Dart detection by frame difference, tip position to score | ✅ | Runs on the phone, about 12 frames a second. Board-rectified frame difference, tip at the thin end of the dart. No trained model yet; the detector is behind an interface so one can drop in |
| Assisted scoring: every visit is confirmed on the iPad | ✅ | Each dart shows the camera's pick plus the next likeliest scores as one-tap swaps. Tap a dart to fix it on the pad. Never submits on its own |
| Learns from corrections | ✅ | A changed guess nudges a bounded per-phone offset, so a camera that reads high gets corrected over time |
| Camera scoring in local games | ✅ | Phone pairs to a private LiveKit room; only darts are sent, the picture stays on the phone |
| Fully automatic scoring (no confirm) | 💤 | Only once accuracy on real boards is measured |
| Multiple cameras for occlusion | 💤 | |
| Paid upgrades (hosted multiplayer, advanced camera scoring) | 💤 | Only if it ever goes beyond friends |
