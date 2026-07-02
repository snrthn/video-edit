import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  // 排除 @ffmpeg/ffmpeg 的预构建，避免 worker 被错误打包
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg']
  }
})
