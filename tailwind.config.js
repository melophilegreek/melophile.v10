/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Feature (Premium UI pass): cooler, deeper matte tones than the
        // original Spotify-clone base (#121212/#181818/#282828) -- reads
        // less like a generic streaming-app template, more like a piece of
        // hardware. accent/ink stay as-is since accent is user-controlled
        // via CSS var and ink is already neutral.
        base: { bg: '#0A0A0C', surface: '#141417', elevated: '#1C1C21', hover: '#28282f' },
        spotify: { green: '#1DB954', greenHover: '#1ed760' },
        ink: { primary: '#FFFFFF', secondary: '#B3B3B3', muted: '#6A6A6A' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: {
        // Signature element (Premium UI pass): a soft, accent-tinted glow
        // used behind album art / the play button -- the one recurring
        // "glass-and-light" motif that ties the panels together, standing
        // in for the ambient glow of a hi-fi component's front panel.
        'panel': '0 1px 0 rgba(255,255,255,0.06) inset, 0 24px 48px -20px rgba(0,0,0,0.7)',
        'lift': '0 8px 24px -8px rgba(0,0,0,0.6)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right': 'slideInRight 0.3s cubic-bezier(0.16,1,0.3,1)',
        'pulse-bar': 'pulseBar 0.75s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideInRight: { from: { opacity: '0', transform: 'translateX(100%)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        pulseBar: { '0%,100%': { transform: 'scaleY(0.35)' }, '50%': { transform: 'scaleY(1)' } },
      },
    },
  },
  plugins: [],
};
