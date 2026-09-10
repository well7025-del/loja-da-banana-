import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        banana: {
          50: "#FEFCE8", 100: "#FEF9C3", 200: "#FEF08A", 300: "#FDE047",
          400: "#FACC15", 500: "#EAB308", 600: "#CA8A04", 700: "#A16207",
          800: "#854D0E", 900: "#713F12",
        },
        leaf: {
          50: "#F0FDF4", 100: "#DCFCE7", 300: "#86EFAC", 500: "#22C55E",
          600: "#16A34A", 700: "#15803D", 900: "#14532D",
        },
        ink: {
          50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1",
          400: "#94A3B8", 500: "#64748B", 600: "#475569", 700: "#334155",
          800: "#1E293B", 900: "#0F172A",
        },
      },
      fontFamily: { sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      boxShadow: { card: "0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)" },
    },
  },
  plugins: [],
} satisfies Config;
