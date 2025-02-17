import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      animation: {
        'float-slow': 'float 20s ease-in-out infinite',
        'float-slower': 'float 25s ease-in-out infinite reverse',
      },
      keyframes: {
        'float': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '25%': { transform: 'translate(10%, 10%)' },
          '50%': { transform: 'translate(-5%, 15%)' },
          '75%': { transform: 'translate(-15%, -5%)' },
        },
      },
    },
  },
  plugins: [],
} as const;

export default config;
