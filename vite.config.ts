import { defineConfig, loadEnv, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import handler from './api/riot'

/**
 * Runs the same serverless proxy that Vercel deploys, but as Vite dev
 * middleware - so `npm run dev` needs no extra process and no `vercel dev`.
 */
function riotApiDev() {
  return {
    name: 'riot-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/riot', (req, res) => {
        void handler(req, res)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (!process.env.RIOT_API_KEY && env.RIOT_API_KEY) {
    process.env.RIOT_API_KEY = env.RIOT_API_KEY
  }
  return {
    plugins: [react(), riotApiDev()],
  }
})
