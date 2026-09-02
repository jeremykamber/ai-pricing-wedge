/**
 * Maps a 0-100 Big Five trait value to a discrete 1-5 scale.
 * Used by the variation slider UI to simplify user choices.
 */
export function mapToDiscrete(val: number): number {
  return Math.min(5, Math.max(1, Math.round(val / 20)))
}

/**
 * Maps a discrete 1-5 value back to the 0-100 scale.
 * Used at the boundary when passing form data to the server action.
 */
export function mapFromDiscrete(val: number): number {
  return val * 20
}
