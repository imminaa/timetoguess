# TimeToGuess

A song guessing game powered by the Apple Music API. Hear a snippet of a
mystery track — one hundredth of a second at first — and name it before your
stages run out.

- **Stages**: 0.01s → 0.1s → 0.5s → 2s → 8s → 15s. Every wrong guess or skip
  unlocks the next, longer snippet. Individual stages can be toggled on/off
  in the settings panel, even mid-game.
- **Progression**: you start on Easy. Two wins at a tier promote you, two
  consecutive losses demote you — or jump to any tier from the ladder.
- **Difficulty tiers** are ranked by global popularity across every era, not
  by this week's charts: Easy/Medium are the top bands of an all-decade canon,
  Hard is a famous artist's lower top-songs, Expert is album tracks that
  *aren't* in that artist's top songs (true deep cuts), Impossible is
  obscure-term search results. See [Defining "popular"](#defining-popular).
- **Guessing**: full-catalog autocomplete; matching is normalized so
  "Africa - Remastered 2011" counts for "Africa".

## Setup (one-time, ~3 minutes)

Requires an Apple Developer account.

1. Go to [Certificates, Identifiers & Profiles → Keys](https://developer.apple.com/account/resources/authkeys/list)
   and create a key with **Media Services (MusicKit)** enabled. Download the
   `.p8` file (you can only download it once).
2. Get a free [Last.fm API key](https://www.last.fm/api/account/create)
   (instant, no review). It supplies the play counts that rank how well-known
   a song is — see below.
3. Copy `.env.example` to `.env.local` and set:
   - `APPLE_TEAM_ID` — your 10-character Team ID (top right of the portal)
   - `APPLE_KEY_ID` — the key's 10-character ID
   - `APPLE_PRIVATE_KEY_PATH` — path to the `.p8` file (it's gitignored if
     kept in the project root as `AuthKey_*.p8`)
   - `LASTFM_API_KEY` — the key from step 2
4. `npm install && npm run dev`, open http://localhost:3000.

> Why not Spotify? Spotify removed audio previews for new API apps in
> Nov 2024 and locked its Web API behind a Premium subscription in Feb 2026.
> Apple Music's API includes a 30-second preview on essentially every song.

## Defining "popular"

Difficulty means "how likely are you to know this song", which needs a
popularity measure that spans decades. Apple Music does not provide one:

- Song resources carry **no** `popularity`, `playCount` or chart-position
  attribute, and `extend=` for those names returns nothing.
- Its charts only ever describe the current week. Anchoring difficulty to
  charts — as this project first did — structurally excludes every classic:
  Billie Jean has not been on a chart since 1983.

So popularity is assembled from two halves:

- **Membership** — `lib/canon.ts` builds an all-era candidate set from Apple's
  editorial *Essentials* series (one per decade from the '50s on, plus the big
  genre cuts), the daily *Top 100: Global* chart, and your own storefront's
  chart for local-language hits. ~1400 songs, 1950s → today.
- **Ranking** — `lib/popularity.ts` scores those songs by Last.fm global
  listener counts, the one number that is comparable across artists and eras.
  Tier bands are **quantiles of what has actually been measured**, not
  hardcoded play counts, so they do not rot as absolute counts inflate.

Apple's per-artist `top-songs` view *is* an all-time play ranking, and it is
what the Hard and Expert tiers use once a famous artist is picked — but it
only ranks within one artist, so it cannot separate Queen from a one-hit
wonder. That is the gap Last.fm fills.

Run `npm run check-popularity` to see which canon sources resolved, the
listener distribution, and what each tier band is drawing from.

## How it works

- `app/api/round` picks a random track for the tier (`lib/pool.ts`
  generators over `lib/apple.ts`) and returns the answer as an AES-256-GCM
  blob (`lib/answer-token.ts`) — the song is never visible in devtools.
- `app/api/audio` proxies the preview so the client can decode it with the
  Web Audio API; snippets are sample-accurate via
  `BufferSource.start(0, 0, duration)` (`lib/use-preview-player.ts`).
- `app/api/guess` compares guesses by song ID or normalized title + artist
  (`lib/normalize.ts`), so any release variant of the right song counts.
- Ladder progression lives in `lib/progression.ts`; progress, stage
  settings, streak, and stats persist in `localStorage`.

## Development

```bash
npm test                 # unit tests (normalization, tokens, progression, stage scale)
npm run sample-pools     # print sample songs per difficulty tier
npm run check-popularity # canon sources, listener distribution, tier bands
npm run check-apple      # diagnose Apple developer-token auth
npm run build            # production build
```

## Config (optional)

- `APPLE_STOREFRONT` — catalog storefront, default `us`. Also decides which
  home chart feeds the canon, so set it to your own market.
- `ANSWER_SECRET` — fixed secret for round-answer tokens; without it a
  per-process random secret is used (rounds don't survive a server restart).
