import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        mist: "#f5f7fb",
        purple: "#6d28d9",
        "purple-dark": "#5b21b6",
        coral: "#d96f52",
      },
    },
  },
  plugins: [],
};

export default config;
