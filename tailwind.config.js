/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      colors: {
        // 🏆 Gold palette
        gold: {
          50:  "#FFFDF5",
          100: "#FFF8E1",
          200: "#FFECB3",
          300: "#FFE082",
          400: "#FFD54F",
          500: "#FFD700", // primary gold
          600: "#FFC107",
          700: "#FFA000",
          800: "#FF8F00",
          900: "#B8860B",
        },
        // 🥈 Silver palette
        silver: {
          50:  "#FAFAFA",
          100: "#F5F5F5",
          200: "#EEEEEE",
          300: "#E0E0E0",
          400: "#BDBDBD",
          500: "#9E9E9E",
          600: "#757575",
          700: "#616161",
          800: "#424242",
          900: "#212121",
        },
        // 🌃 Navy (primary brand)
        navy: {
          50:  "#E8EAF6",
          100: "#C5CAE9",
          200: "#9FA8DA",
          300: "#7986CB",
          400: "#5C6BC0",
          500: "#3F51B5",
          600: "#3949AB",
          700: "#303F9F",
          800: "#283593",
          900: "#1a1a2e", // primary brand dark
          950: "#16213e",
        },
        // 👑 Royal (accent)
        royal: {
          DEFAULT: "#7c3aed",
          light: "#a78bfa",
          dark: "#5b21b6",
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0,0,0,0.04)',
        'card': '0 4px 16px rgba(0,0,0,0.06)',
        'gold': '0 4px 16px rgba(255,215,0,0.25)',
        'navy': '0 4px 16px rgba(26,26,46,0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
    },
  },
  plugins: [],
};
