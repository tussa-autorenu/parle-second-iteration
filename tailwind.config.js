/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind looks for `className` usage in these paths.
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Parle palette — pulled from Figma node 292:480.
      // Naming convention: parle-{role} so usage reads clearly:
      //   bg-parle-dark, text-parle-body, border-parle-border, etc.
      colors: {
        parle: {
          // Brand
          logo: "#911cff",       // accent/primary (logo, count chip text)
          accent: "#a749ff",     // accent text / secondary brand
          dark: "#1d0633",       // accent/dark (CTAs, headings)
          // Desat Ramp — neutral greys with a hint of warmth, used for
          // dividers, secondary text, and quiet chip backgrounds.
          "desat-0": "#fcfbff",  // raised tile / card surface (price card, spec tiles)
          "desat-1": "#f5f3f6",  // lightest chip bg
          "desat-2": "#ebe7ee",  // close-button bg
          "desat-3": "#e0dbe5",  // card borders, dividers
          "desat-7": "#7a757f",  // secondary / body text
          // Legacy surfaces (still used by Loading scene placeholders)
          card: "#fcfbff",
          pill: "#f4e8ff",
          border: "#e4dfed",
          heading: "#1d0633",
          body: "#66517a",
          caption: "#dbb7ff",    // loading-screen caption text
          // State
          success: "#44c398",    // available / charge indicator
          // Loading gradient stops (top → bottom)
          "grad-1": "#140329",
          "grad-2": "#1d0633",
          "grad-3": "#2e0a52",
        },
      },
      // Font families map to the names that @expo-google-fonts exports.
      // These won't apply until we install + load the fonts in Step 5 — the
      // Tailwind classes are wired up now so we don't have to revisit later.
      fontFamily: {
        "space-grotesk": ["SpaceGrotesk_400Regular"],
        "space-grotesk-medium": ["SpaceGrotesk_500Medium"],
        "space-grotesk-bold": ["SpaceGrotesk_700Bold"],
        "space-mono": ["SpaceMono_400Regular"],
      },
    },
  },
  plugins: [],
};
