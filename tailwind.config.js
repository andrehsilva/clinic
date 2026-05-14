/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
      },
      colors: {
        accent: {
          DEFAULT: '#B85C72',
          light: '#F7EDF0',
          medium: '#D4849A',
          dark: '#8F3F55',
        },
        success: {
          DEFAULT: '#1A7A48',
          light: '#E8F8EF',
        },
        page: '#F4F2EF',
        card: '#FFFFFF',
        border: '#EBEBEB',
        text: {
          primary: '#1A1A1A',
          secondary: '#7A7A7A',
        },
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
}
