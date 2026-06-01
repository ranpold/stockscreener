import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [resolve(here, "index.html"), resolve(here, "src/**/*.{ts,tsx}")],
  theme: {
    extend: {
      colors: {
        bg: "#0b0e14",
        panel: "#141925",
        panel2: "#1c2333",
        edge: "#2a3346",
        ink: "#e6edf3",
        muted: "#8b96a8",
        accent: "#4f8cff",
        pos: "#22c55e",
        neg: "#ef4444",
      },
    },
  },
  plugins: [],
};
