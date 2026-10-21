import { PageShell } from "@/components/page-shell";
import { PracticePickerSkeleton } from "./practice-picker";

export default function Loading() {
  return (
    <PageShell busy title="Practice">
      <PracticePickerSkeleton />
    </PageShell>
  );
}
