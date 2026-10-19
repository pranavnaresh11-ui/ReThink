import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One small app; the main chunk is ~500 kB mostly from framer-motion and sql.js glue.
  build: { chunkSizeWarningLimit: 700 },
})
