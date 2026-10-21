import "server-only";
import { revalidatePath } from "next/cache";

export function revalidateGameData() {
  revalidatePath("/");
  revalidatePath("/players");
  revalidatePath("/players/[id]", "page");
  revalidatePath("/players/[id]/vs/[other]", "page");
  revalidatePath("/practice");
}
