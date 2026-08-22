import Game from "@/components/Game";
import { hasAppleCreds } from "@/lib/apple";
import { hasLastfmCreds } from "@/lib/lastfm";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Game ready={hasAppleCreds() && hasLastfmCreds()} />;
}
