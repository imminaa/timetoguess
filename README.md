# TimeToGuess

A song guessing game powered by the Apple Music API. Hear a snippet of a
mystery track — one hundredth of a second at first — and name it before your
stages run out.

- **Stages**: 0.01s → 0.1s → 0.5s → 2s → 8s → 15s. Every wrong guess or skip
  unlocks the next, longer snippet. Individual stages can be toggled on/off
  in the settings panel, even mid-game.
- **Progression**: you start on Easy. Two wins at a tier promote you, two
  consecutive losses demote you — or jump to any tier from the ladder.
- **Difficulty tiers** are built Apple-natively (the API has no popularity
  score): Easy/Medium from the most-played charts, Hard from chart artists'
  lower top-songs, Expert from album tracks that *aren't* in the artist's top
  songs (true deep cuts), Impossible from obscure-term search results.
- **Guessing**: full-catalog autocomplete; matching is normalized so
  "Africa - Remastered 2011" counts for "Africa".

## Setup (one-time, ~3 minutes)

Requires an Apple Developer account.

1. Go to [Certificates, Identifiers & Profiles → Keys](https://developer.apple.com/account/resources/authkeys/list)
   and create a key with **Media Services (MusicKit)** enabled. Download the
   `.p8` file (you can only download it once).
2. Copy `.env.example` to `.env.local` and set:
   - `APPLE_TEAM_ID` — your 10-character Team ID (top right of the portal)
   - `APPLE_KEY_ID` — the key's 10-character ID
   - `APPLE_PRIVATE_KEY_PATH` — path to the `.p8` file (it's gitignored if
     kept in the project root as `AuthKey_*.p8`)
3. `npm install && npm run dev`, open http://localhost:3000.

> Why not Spotify? Spotify removed audio previews for new API apps in
> Nov 2024 and locked its Web API behind a Premium subscription in Feb 2026.
> Apple Music's API includes a 30-second preview on essentially every song.

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
npm test                 # unit tests (normalization, tokens, progression, JWT)
npm run sample-pools     # print sample songs per difficulty tier
npm run build            # production build
```

## Config (optional)

- `APPLE_STOREFRONT` — catalog storefront, default `us`.
- `ANSWER_SECRET` — fixed secret for round-answer tokens; without it a
  per-process random secret is used (rounds don't survive a server restart).
