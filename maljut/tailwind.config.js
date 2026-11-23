/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0f14",
        card: "#131a22",
        line: "#1f2a36",
        ink: "#e6edf3",
        mute: "#8b9aab",
        calm: "#5fb3a8",
        warm: "#e0a96d",
        soft: "#9d8cd6",
      },
      fontFamily: { sans: ["-apple-system", "BlinkMacSystemFont", "Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
