import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#16a34a",
          fg: "#052e16",
        },
      },
      // Safe-area para PWA em iOS (notch / barra inferior).
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
      },
      keyframes: {
        // Transição leve ao trocar o mês na fatura do cartão.
        "month-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "month-in": "month-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
