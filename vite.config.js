import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vendor code goes in its own long-lived chunks: an app change then re-downloads only the small app chunks, not three.js and React.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 760, // three.js alone is ~716 kB minified (186 kB gzip): that is the known floor, not a regression
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          if (/node_modules\/three\//.test(id)) return 'three'
          return undefined
        },
      },
    },
  },
})
