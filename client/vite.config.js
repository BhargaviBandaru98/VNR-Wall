import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3105,
    host: true,
    strictPort: false,
    allowedHosts: [
      '3d87df051e73.ngrok-free.app'
    ]
  }
})
