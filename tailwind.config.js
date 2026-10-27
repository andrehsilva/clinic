/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
      },
      colors: {
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          light: 'rgb(var(--color-accent-light) / <alpha-value>)',
          medium: 'rgb(var(--color-accent-medium) / <alpha-value>)',
          dark: 'rgb(var(--color-accent-dark) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          light: 'rgb(var(--color-success-light) / <alpha-value>)',
        },
        status: {
          info: {
            DEFAULT: 'rgb(var(--color-status-info) / <alpha-value>)',
            light: 'rgb(var(--color-status-info-light) / <alpha-value>)',
          },
          warning: {
            DEFAULT: 'rgb(var(--color-status-warning) / <alpha-value>)',
            light: 'rgb(var(--color-status-warning-light) / <alpha-value>)',
          },
          danger: {
            DEFAULT: 'rgb(var(--color-status-danger) / <alpha-value>)',
            light: 'rgb(var(--color-status-danger-light) / <alpha-value>)',
          },
          purple: {
            DEFAULT: 'rgb(var(--color-status-purple) / <alpha-value>)',
            light: 'rgb(var(--color-status-purple-light) / <alpha-value>)',
          },
          teal: {
            DEFAULT: 'rgb(var(--color-status-teal) / <alpha-value>)',
            light: 'rgb(var(--color-status-teal-light) / <alpha-value>)',
          },
        },
        page: 'rgb(var(--color-page) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          subtle: 'rgb(var(--color-border-subtle) / <alpha-value>)',
        },
        surface: {
          hover: 'rgb(var(--color-surface-hover) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
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
