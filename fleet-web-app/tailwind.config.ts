import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Parle brand
        "accent-dark": "#1d0633",
        "accent-light": "#bd77ff",
        "accent-primary": "#911cff",
        "desat-0": "#faf9fb",
        "desat-1": "#f5f3f6",
        "desat-2": "#ebe7ee",
        "desat-3": "#e0dbe5",
        "desat-4": "#d6cfdd",
        "desat-7": "#7a757f",

        // Semantic
        success: "#1dc089",
      },
      fontFamily: {
        sans: [
          "var(--font-space-grotesk)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-space-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
