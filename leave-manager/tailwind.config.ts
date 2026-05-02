import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          light: '#DBEAFE',
          dark: '#1D4ED8',
        },
        accent: {
          DEFAULT: '#059669',
          light: '#D1FAE5',
        },
        danger: {
          DEFAULT: '#DC2626',
          light: '#FEE2E2',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#FEF3C7',
        },
        purple: {
          DEFAULT: '#7C3AED',
          light: '#EDE9FE',
        },
      },
      borderRadius: {
        'card': '12px',
        'btn': '8px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)',
        'modal': '0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
};
export default config;
