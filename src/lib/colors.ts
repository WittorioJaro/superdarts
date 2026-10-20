/** Player colours: distinct from each other and from the red/green of the board rings. */
export const PLAYER_COLORS = ["#E0A83A", "#5AA9E6", "#C77DFF", "#F2EFE4", "#FF8C61", "#4CC9B0", "#F15BB5", "#B5C99A"];

export function pickColor(index: number) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}
