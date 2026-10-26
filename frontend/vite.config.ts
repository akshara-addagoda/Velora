import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { normalizeApiOrigin } from './src/api-url'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const apiOrigin = normalizeApiOrigin(env.VITE_API_BASE_URL || '', command === 'build')
  if (command === 'build' && process.env.VERCEL === '1' && !apiOrigin) {
    throw new Error('Set VITE_API_BASE_URL to the Render HTTPS origin before building on Vercel.')
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': env.VITE_API_TARGET || 'http://127.0.0.1:8000' },
    },
  }
})
