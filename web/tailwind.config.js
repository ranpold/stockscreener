import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [resolve(here, "index.html"), resolve(here, "src/**/*.{ts,tsx}")],
  theme: {
    extend: {
      colors: {
        // Tinted slate (cool, layered) instead of flat gray.
        bg: "#0a0e17",
        panel: "#111726",
        panel2: "#19202f",
        edge: "#26314a",
        ink: "#e8eef7",
        muted: "#8a97ad",
        accent: "#5b8dff",
        accent2: "#0a1020",
        // Bolder, market-style semantic colors.
        pos: "#16c784",
        neg: "#ea3943",
        warn: "#f5a623",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        num: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.35), 0 12px 28px -16px rgba(0,0,0,0.65)",
        glow: "0 0 0 1px rgba(91,141,255,0.25), 0 8px 30px -12px rgba(91,141,255,0.35)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};
