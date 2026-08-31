/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'trial-blue': '#294F73',
        'trial-navy': '#1D3B57',
        'trial-steel': '#6688A6',
        'trial-mist': '#E5EDF5',
        'trial-slate': '#475569',
      },
    }
  },
  plugins: [],
};

export default config;
