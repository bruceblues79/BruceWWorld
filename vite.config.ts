import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 构建版本号：每次 build 生成 UTC 时间戳 YYYYMMDD-HHMMSS，注入为全局常量
// __BUILD_VERSION__，供 src/utils/asset.ts 的 versionedUrl() 给 public 静态资源
// 路径追加 ?v= 查询参数，部署后浏览器自动重新下载，无需用户清缓存
const BUILD_VERSION = (() => {
  const s = new Date().toISOString()
  // "2026-09-28T12:34:56.789Z" → "20260928-123456"
  return s.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
})()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
})
