import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      boxShadow: {
        medical: "0 22px 70px rgba(15, 23, 42, 0.18)",
      },
      animation: {
        heartbeat: "heartbeat 1.15s ease-in-out infinite",
        pulseSoft: "pulseSoft 1.8s ease-in-out infinite",
      },
      keyframes: {
        heartbeat: {
          "0%, 100%": { transform: "scale(1)" },
          "18%": { transform: "scale(1.12)" },
          "34%": { transform: "scale(0.98)" },
          "52%": { transform: "scale(1.08)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: ".55" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
