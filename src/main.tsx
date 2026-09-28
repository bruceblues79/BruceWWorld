import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

declare const __BUILD_VERSION__: string

// 版本检测：拉取最新 version.json，与当前 bundle 的构建版本比对。
// 不一致则用带时间戳的 URL 强制刷新，绕过浏览器缓存（尤其是移动端 Chrome）。
function checkVersion() {
  fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((data: { version: string }) => {
      if (data.version && data.version !== __BUILD_VERSION__) {
        window.location.replace(window.location.pathname + '?r=' + Date.now())
      }
    })
    .catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 应用渲染后再检测版本，避免阻塞首屏
checkVersion()
