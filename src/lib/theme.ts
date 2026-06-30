/**
 * Raw token constants for places that *can't* take Tailwind class names —
 *   - `expo-linear-gradient` color stops
 *   - `Reanimated` `interpolateColor` inputs
 *   - the status bar `backgroundColor` prop
 *   - SVG fill/stroke values
 *
 * These mirror `tailwind.config.js` exactly. If you change a value, change it in both places.
 */

export const colors = {
  // Brand
  logo: "#911cff",       // accent/primary
  accent: "#a749ff",     // accent text / secondary brand
  dark: "#1d0633",       // accent/dark — CTAs, headings
  // Desat Ramp (neutrals with a hint of warmth) — current Figma tokens.
  desat0: "#fcfbff",     // raised tile / card surface
  desat1: "#f5f3f6",     // lightest chip bg
  desat2: "#ebe7ee",     // close-button bg
  desat3: "#e0dbe5",     // card borders, dividers
  desat7: "#7a757f",     // secondary / body text
  // Legacy (still referenced by the Loading scene placeholder layer).
  card: "#fcfbff",
  pill: "#f4e8ff",
  border: "#e4dfed",
  heading: "#1d0633",
  body: "#66517a",
  caption: "#dbb7ff",
  // State
  success: "#44c398",
  // Loading-screen gradient stops, top → bottom
  grad1: "#140329",
  grad2: "#1d0633",
  grad3: "#2e0a52",
} as const;

/**
 * Font family names — these must match the keys passed to `useFonts({...})`
 * in `app/_layout.tsx`. The exact string is what gets registered with the
 * RN font system, so don't change without updating both places.
 */
export const fonts = {
  grotesk: "SpaceGrotesk_400Regular",
  groteskMedium: "SpaceGrotesk_500Medium",
  groteskBold: "SpaceGrotesk_700Bold",
  mono: "SpaceMono_400Regular",
} as const;

/**
 * Common radii used across the design. Card = 16, Pill = 12, Hero phone = 56.
 */
export const radii = {
  pill: 12,
  card: 16,
  sheet: 20,
  phone: 56,
  full: 9999,
} as const;
