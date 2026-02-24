import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.VITE_PORT) || 3105,
    allowedHosts: (process.env.VITE_ALLOWED_HOSTS || '').split(',').filter(Boolean),
    optimizeDeps: {
      exclude: ['react-icons']
    }
  }
})
