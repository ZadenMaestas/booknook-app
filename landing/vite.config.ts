import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'
import ssrPlugin from 'vite-ssr-components/plugin'

const watchPublic = {
  name: 'watch-public',
  configureServer(server: any) {
    server.watcher.add('public/**/*')
    server.watcher.on('change', (file: string) => {
      if (file.includes('/public/')) {
        server.ws.send({ type: 'full-reload' })
      }
    })
  },
  handleHotUpdate({ file, server }: any) {
    if (file.includes('/public/')) {
      server.ws.send({ type: 'full-reload' })
      return []
    }
  }
}

export default defineConfig({
  plugins: [cloudflare(), ssrPlugin(), watchPublic]
})
