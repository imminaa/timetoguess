import { DEFAULT_DISABLED_STAGES, DIFFICULTIES, STAGES } from "@/lib/game-config";
import { FAQ } from "@/lib/site";

/**
 * Below-the-fold prose. Deliberately a server component with no client
 * boundary: this is the only text on the page a crawler can read without
 * executing the game, so it must be in the initial HTML. It is also the
 * source the FAQPage JSON-LD in page.tsx describes — keep the two in step by
 * editing lib/site.ts, not this file.
 */
export default function SiteInfo() {
  // Only the stages that are on by default — 0.01s is opt-in, so listing it
  // here would contradict the "tenth of a second" claim above.
  const ladder = STAGES.filter((s) => !DEFAULT_DISABLED_STAGES.includes(s))
    .map((s) => `${s}s`)
    .join(" → ");

  return (
    <section
      aria-labelledby="about-heading"
      className="mx-auto w-full max-w-lg shrink-0 border-t border-line px-4 py-14 sm:px-6"
    >
      <h2
        id="about-heading"
        className="font-display text-2xl font-bold tracking-tight text-balance"
      >
        A song guessing game that starts almost impossibly short
      </h2>
      <p className="mt-4 text-sm/6 text-dim">
        TimeToGuess plays you a fragment of a song and asks you to name it. The
        first clip is a tenth of a second — long enough for a snare hit, a vocal
        syllable, the first breath of a synth pad. If that is not enough, guess
        wrong or skip and the clip grows. Most people need three stages. Some
        people, infuriatingly, do not.
      </p>
      <p className="mt-3 text-sm/6 text-dim">
        It is free, there is no sign-up, and it runs in the browser on desktop
        and mobile. Songs come from the Apple Music catalogue, and difficulty is
        ranked by worldwide listener counts spanning the 1950s to today — so the
        easy tiers are songs that were genuinely enormous in <em>some</em> era,
        not just whatever is charting this week.
      </p>

      <h3 className="mt-10 font-display text-lg font-semibold">How to play</h3>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm/6 text-dim marker:text-faint">
        <li>Press play and listen to the clip. It is over almost before it starts.</li>
        <li>
          Start typing a song title — the autocomplete searches the full
          catalogue, and any release variant of the right track counts.
        </li>
        <li>
          A wrong guess or a skip unlocks the next, longer clip. The ladder runs{" "}
          <span className="font-mono text-ink">{ladder}</span>. A 0.01s opening
          stage can be switched on in settings.
        </li>
        <li>
          Stuck? Spend a hint for the decade, the genre, the album art, or the
          first letter of the title.
        </li>
        <li>
          Win twice at a tier to climb it. Lose twice in a row and you slide
          back down — or jump straight to any tier you fancy.
        </li>
      </ol>

      <h3 className="mt-10 font-display text-lg font-semibold">Difficulty tiers</h3>
      <dl className="mt-4 space-y-2.5 text-sm/6">
        {DIFFICULTIES.map((d) => (
          <div key={d.id} className="flex gap-3">
            <dt className="w-24 shrink-0 font-display font-semibold text-ink">
              {d.label}
            </dt>
            <dd className="text-dim">{d.tagline}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-10 font-display text-lg font-semibold">
        Frequently asked questions
      </h3>
      <dl className="mt-4 space-y-5">
        {FAQ.map((item) => (
          <div key={item.q}>
            <dt className="font-medium text-ink">{item.q}</dt>
            <dd className="mt-1.5 text-sm/6 text-dim">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
