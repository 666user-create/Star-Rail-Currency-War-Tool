import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { createReadStream, existsSync } from 'fs'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // 素材只在本机生成。开发预览按白名单读原始目录，禁止 public 素材被复制进发布产物。
    publicDir: false,
    plugins: [react(), {
      name: 'local-pet-preview-assets',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/__pet_preview_assets/', (req, res) => {
          const name = (req.url ?? '').split('?')[0].replace(/^\//, '')
          if (!['pet03.obj', 'pet03_color.png', 'pet03_cool.png', 'pet03_warm.png'].includes(name)) {
            res.statusCode = 404
            res.end()
            return
          }
          const file = resolve('assets/official_pet', name)
          if (!existsSync(file)) { res.statusCode = 404; res.end(); return }
          res.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : 'text/plain; charset=utf-8')
          createReadStream(file).on('error', () => res.destroy()).pipe(res)
        })
      }
    }],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          pet: resolve('src/renderer/pet.html'),
          bubble: resolve('src/renderer/bubble.html'),
          timer: resolve('src/renderer/timer.html'),
          panel: resolve('src/renderer/panel.html'),
          settings: resolve('src/renderer/settings.html')
        }
      }
    }
  }
})
