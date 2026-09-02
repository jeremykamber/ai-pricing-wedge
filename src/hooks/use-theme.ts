"use client"

// Theme is dark-only for now. Light values are stashed in globals.css :root comment.
// To re-enable toggling, uncomment the light block, restore @custom-variant dark, and expand this hook.

function useTheme() {
  return { theme: "dark" as const, toggleTheme: () => {} }
}

export { useTheme }
