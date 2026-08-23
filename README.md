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
  editorial *Essentials* series (one per decade from the '50s on, plus genre
  cuts and a per-artist playlist for the best-represented artists), the daily
  *Top 100* of ~20 markets, and the per-genre charts. Each song records how
  many independent sources vouch for it, which is the one popularity signal
  here that does not come from Last.fm.
- **Ranking** — `lib/popularity.ts` combines four weak signals, because each
  is wrong alone: cohort-relative listeners (so a 2024 hit is not punished for
  having had two years to accumulate scrobbles instead of forty), source
  multiplicity, plays-per-listener (broad reach vs. a small devoted audience),
  and the song's rank within its own artist's catalog.

Each decade's reference point is the **85th percentile of its well-vouched-for
songs**, not the median of everything in it. The canon's tail differs sharply by
era — the 1960s arrive via curated Essentials playlists, the 2020s via twenty
country charts carrying a lot of filler — and taking the middle of each let the
2020s baseline collapse to filler level, handing every real recent hit a ratio
up to 168x and 46% of the Easy tier.

Two details do most of the work:

- Last.fm is queried **per artist**, not per song. `artist.getTopTracks`
  returns 50 tracks with their listener counts in one request, so the whole
  canon costs about what a few-hundred-song sample used to.
- Lookups use the catalog's **unsplit** artist name. Last.fm's `autocorrect`
  never reports a miss — ask it for "Earth" instead of "Earth, Wind & Fire"
  and it returns a different song called *September* with 1,215 listeners
  rather than 2,171,206. `lib/lastfm.ts` rejects an answer that lands
  implausibly far above the artist's own catalog.

Tier bands are **quantiles**, and the listener floors that sit on top of them
are multiples of the canon's own median — never hardcoded play counts — so
neither rots as absolute counts inflate. The floors are what stop cohort
normalization from promoting a mid-tier recent single into "songs everybody
knows".

Apple's per-artist `top-songs` view *is* an all-time play ranking, and it is
where the Hard and Expert tiers get their playable candidates once a famous
artist is picked — but it only ranks within one artist, so it cannot separate
Queen from a one-hit wonder. That is the gap Last.fm fills.

### Building the snapshot

Scoring the whole canon takes minutes and a few thousand API calls, so it is
done ahead of time and committed as `data/canon.json`:

```bash
npm run build-canon               # full rebuild, ~20 minutes
npm run build-canon -- --rescore  # re-rank what is already there, instantly
```

Requests are paced to Last.fm's documented ~5/second, which is what the build
time buys: running unpaced returned 429s that were silently miscounted as songs
nobody had heard of. Override with `LASTFM_MIN_REQUEST_GAP_MS` if your key
allows more. The build fails loudly if any song is lost to an API error rather
than to genuine obscurity.

Because each song's raw measurement is stored next to its score, changing the
*ranking* never needs a refetch — `--rescore` re-ranks the existing snapshot in
seconds.

Without a snapshot the game still runs — it scores a live sample on first use
— but the tiers draw from far fewer songs. Rebuild it when it goes stale
(`npm run check-popularity` reports its age).

Run `npm run check-popularity` to see the listener distribution, what each
tier is drawing from, and whether the widely-known benchmark songs
(`lib/canon-benchmark.ts`) actually landed in Easy.

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
npm test                 # unit tests (scoring, popularity guard, pools, normalization)
npm run build-canon      # rebuild data/canon.json (slow; needs both API keys)
npm run sample-pools     # print sample songs per difficulty tier
npm run check-popularity # listener distribution, tier bands, benchmark placement
npm run check-apple      # diagnose Apple developer-token auth
npm run build            # production build
```

## Config (optional)

- `APPLE_STOREFRONT` — catalog storefront, default `us`. Also decides which
  home chart feeds the canon, so set it to your own market.
- `ANSWER_SECRET` — fixed secret for round-answer tokens; without it a
  per-process random secret is used (rounds don't survive a server restart).
