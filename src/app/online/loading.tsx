import { PageShell } from "@/components/page-shell";
import { OnlineHome } from "./online-home";

const none = Promise.resolve([]);

/** The real forms: they need nothing from the server. Your rooms show up once the page arrives. */
export default function Loading() {
  return (
    <PageShell busy title="Online" subtitle={<p className="text-lg text-dim">Play friends on their own boards. Each of you enters your own darts.</p>}>
      <OnlineHome rooms={none} />
    </PageShell>
  );
}
