import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages 的網址是 https://<帳號>.github.io/<repo 名稱>/，
// 所以打包後的網頁檔必須以 /chat/ 為前綴（repo 名稱改了，這裡也要跟著改）。
// 本機開發（npm run dev）用 / 即可。
const REPO_BASE = '/chat/'

export default defineConfig(({ mode }) => ({
  base: mode === 'development' ? '/' : REPO_BASE,
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
}))
