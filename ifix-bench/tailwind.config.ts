import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bench: {
          bg: "#0b0d10",
          panel: "#14181d",
          card: "#1b2027",
          line: "#2a313a",
          muted: "#9aa4b2",
          text: "#f2f4f7",
          accent: "#f5b301",
          ok: "#22c55e",
          bad: "#ef4444",
          info: "#38bdf8",
        },
      },
      fontSize: { base: ["1.125rem", "1.65rem"] },
      minHeight: { touch: "3.5rem" },
    },
  },
  plugins: [],
} satisfies Config;
