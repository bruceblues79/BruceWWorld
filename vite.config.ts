import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// 构建时间戳，注入到 bundle 中供版本检测使用
const buildVersion = Date.now().toString()

// 生成 version.json 到 dist，供运行时版本检测拉取
function versionJsonPlugin(): Plugin {
  return {
    name: 'version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: buildVersion }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionJsonPlugin()],
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion),
  },
})
