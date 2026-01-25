/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#00695C', // Deep Teal
          light: '#B2DFDB', // Light Teal
          dark: '#004D40',
          50: '#e0f2f1',
          100: '#b2dfdb',
          200: '#80cbc4',
          300: '#4db6ac',
          400: '#26a69a',
          500: '#009688',
          600: '#00897b',
          700: '#00796b',
          800: '#00695c',
          900: '#004d40',
        },
        accent: {
          DEFAULT: '#1976D2', // Blue
          light: '#63a4ff',
          dark: '#004ba0',
        },
        success: '#4CAF50',
        warning: '#FFC107',
        danger: '#D32F2F',
        info: '#1976D2',
        background: '#F8F9FA',
        surface: '#FFFFFF',
        text: {
          primary: '#333333',
          secondary: '#666666',
        }
      },
    },
  },
  plugins: [],
}
