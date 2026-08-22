import type { Config } from "tailwindcss";

/**
 * American Express–inspired brand theme
 * ------------------------------------
 * Bright Blue (primary): #016FD0  — Blue Box / logo blue
 * Deep Blue (ink):       #00175A  — navy for type & structure
 * Mid Blue:              #0051A8  — hover / secondary actions
 * Soft Blue washes:      #E8F3FC → #F5F9FD
 * Neutrals: cool gray with blue undertone
 * Semantic (risk decisions only): approve / refer / decline
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#000E33",
          900: "#00175A",
          800: "#002B7A",
          700: "#003E9C",
          600: "#0051A8",
        },
        mist: {
          50: "#F5F9FD",
          100: "#E8F3FC",
          200: "#D0E4F6",
          300: "#A8C8E8",
          400: "#7AA3CF",
          500: "#5B7A9A",
          600: "#3F5A78",
          700: "#2A4060",
        },
        approve: "#0B7A4B",
        refer: "#A15C08",
        decline: "#B42318",
        // Amex Bright Blue
        signal: "#016FD0", // American Express Blue — Hex #016FD0 · RGB(1,111,208) · PMS 285 C
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(0, 23, 90, 0.04), 0 1px 2px rgba(0, 23, 90, 0.03)",
        lift: "0 8px 24px rgba(0, 23, 90, 0.07)",
      },
      maxWidth: {
        content: "1180px",
        shell: "1180px",
      },
    },
  },
  plugins: [],
};

export default config;
