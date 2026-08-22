"use client";

import { Plugs } from "@phosphor-icons/react";

export default function SetupBanner() {
  return (
    <div
      role="status"
      className="mb-6 rounded-2xl border border-tier-hard/30 bg-tier-hard/5 p-5 text-sm"
    >
      <p className="flex items-center gap-2 font-display font-semibold text-tier-hard">
        <Plugs size={18} aria-hidden /> One-time setup needed
      </p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-dim">
        <li>
          In your{" "}
          <a
            href="https://developer.apple.com/account/resources/authkeys/list"
            target="_blank"
            rel="noreferrer"
            className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-accent"
          >
            Apple Developer account
          </a>
          , create a key with <span className="text-ink">Media Services (MusicKit)</span>{" "}
          enabled and download the <code className="text-ink">.p8</code> file.
        </li>
        <li>
          Copy <code className="text-ink">.env.example</code> to{" "}
          <code className="text-ink">.env.local</code>: set{" "}
          <code className="text-ink">APPLE_TEAM_ID</code>,{" "}
          <code className="text-ink">APPLE_KEY_ID</code>, and{" "}
          <code className="text-ink">APPLE_PRIVATE_KEY_PATH</code> (path to the .p8).
        </li>
        <li>Restart the dev server, then hit play.</li>
      </ol>
    </div>
  );
}
