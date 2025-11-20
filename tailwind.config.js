import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0F0F11', // Global Background
          bgSecondary: '#1A1C1F', // Surface (cards/panels)
          surface: '#1A1C1F', // Surface (cards/panels)
          text: {
            primary: '#E5E7EB', // Primary Text
            secondary: '#9CA3AF', // Secondary Text
          },
          border: '#2A2D31', // Borders
          table: {
            header: '#1D1F22',
            selection: 'rgba(120, 120, 200, 0.35)',
            resize: '#4A90E2',
          },
          node: {
            bg: '#3A3A3A', // ReactFlow Background
          }
        },
        note: {
          yellow: '#4A430F',
          rose: '#4A1F2A',
          red: '#4A1A1A',
          lightblue: '#143447',
          darkblue: '#102B4A',
          pin: '#F87171',
        },
        editor: {
            text: {
                lightblue: '#8AB4FF',
                lightred: '#F28B82',
                lightgreen: '#81C995',
                lightorange: '#FFB86C',
                lightyellow: '#FCD34D',
                lightpurple: '#CFA8FF',
                lightpink: '#FF9ACF',
                gray: '#A1A1AA',
            },
            bg: {
                softyellow: '#4A3F1A',
                softorange: '#4A2F1A',
                softpink: '#4A1F35',
                softblue: '#1A2F4A',
                softgreen: '#1A4A2C',
                softpurple: '#3A1A4A',
                softgray: '#2A2A2A',
            }
        },
        sticker: {
            postal: '#EF4444',
            approved: '#22C55E',
            smile: '#FACC15',
            completed: '#10B981',
            pending: '#EF4444',
        }
      }
    },
  },
  plugins: [
    typography,
  ],
}
