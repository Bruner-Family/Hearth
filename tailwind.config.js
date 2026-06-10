/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantic tokens — values live in src/global.css as CSS variables so
        // light and dark are both first-class themes.
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        card: "rgb(var(--c-card) / <alpha-value>)",
        edge: "rgb(var(--c-edge) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        "ink-dim": "rgb(var(--c-ink-dim) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        "on-accent": "rgb(var(--c-on-accent) / <alpha-value>)",
        ok: "rgb(var(--c-ok) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
        danger: "rgb(var(--c-danger) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
