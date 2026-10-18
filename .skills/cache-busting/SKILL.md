---
name: cache-busting
description: 静态站点部署后的破缓存（cache busting）通用策略。当为新项目设计部署缓存击穿方案，或排查"改了没生效、强刷才生效"类问题时使用。核心是三层模型：内容哈希管资产、版本化 URL 管文档、显式治理管 Service Worker。
---

# Web 静态站点破缓存三层模型

## 问题本质

浏览器缓存的失效责任是分层的，没有任何单一开关能全管住：

- **JS/CSS 等资产**：文件名可以带内容哈希，内容变 → 文件名变 → 缓存自动失效。这一层 bundler 标配，无需自制。
- **HTML 文档**：文件名恒定（index.html），无法靠改名失效，只能靠"换一个访问 URL"或响应头。
- **Service Worker**：能拦截一切请求并自持久化缓存，还会反过来吞掉前两层的效果——它是唯一能"越权"的部分，必须显式治理。

三层各管各的对象，缺一层就有一类旧内容救不回来。

## L1 资产层：内容哈希

- 构建产物文件名必须含**内容哈希**（如 `app-5QxWPUDe.js`），HTML 每次构建引用新哈希名。
- 服务器可对哈希资产返回长缓存甚至 `immutable`——它们永远不会"同名异容"。
- 前提：HTML 必须先新鲜（见 L2），否则用户拿着旧 HTML 引旧哈希。
- 反模式：用时间戳做文件名。每次部署全量失效，缓存形同虚设。

## L2 文档层：版本化访问 URL

- 部署完成时交付带参数的访问地址：`https://<站点>/?v=<版本>-<UTC时间戳>`。
  查询串变化 = 浏览器视为不同资源 = 绕过对 HTML 的缓存。
- **版本号单一真值**：只在项目清单（如 package.json）维护一处；构建时注入产物（HTML meta 标签 + 全局常量），部署 URL 复用同一版本号。
- **时间戳取部署时刻 UTC**（精确到分钟）：对抗"同版本号重部署"。
- 配套：服务器对 index.html 返回 `no-cache`（或等价弱缓存头）更稳，参数作为保底而非唯一手段。
- 版本注入的通用做法：bundler 的 HTML 转换钩子往 `</head>` 前插入 `<meta name="app-version" content="<版本>">`，同时 define 一个全局常量供脚本读取。两处同源，用于线上核验与自动比对。

## L3 Service Worker 层：显式治理

- SW 自身注册必须版本化：`navigator.serviceWorker.register('/sw.js?v=N')`，逻辑变更时递增 N。不版本化时浏览器最长 24 小时才强制复查 SW 更新。
- 注册时加 `updateViaCache: 'none'`：SW 脚本自身永不走 HTTP 缓存。
- **导航请求 network-first**：在线时永远拿网络 HTML，离线才回退缓存。禁止预缓存 HTML——那会让用户永远停在旧版。
- SW 更新流程：检测到字节差异 → `skipWaiting()` + `clients.claim()`，新页面立即用新 SW。
- SW 顶部放版本常量，控制台打印，便于核验。
- 其余静态请求尽量不拦截：资产失效交给 L1 的内容哈希，SW 只管导航兜底。

## 验证清单（数据自证，勿依赖目测）

- [ ] 构建产物 HTML 含版本 meta，值与项目清单一致
- [ ] 产物 JS/CSS 文件名带内容哈希
- [ ] SW 注册 URL 带版本参数；SW 代码含 network-first 导航处理与 `updateViaCache: 'none'`
- [ ] 部署后直连站点根 URL 能返回新版本（证明服务器侧文档新鲜度成立）
- [ ] 带破缓存参数的 URL 可访问，页面版本与预期一致（控制台版本日志 / meta 标签比对）

## 反模式汇总

| 反模式 | 后果 |
| --- | --- |
| 只哈希资产不管 HTML | 旧 HTML 引旧哈希 → 404 或整体旧版 |
| SW 预缓存 HTML | network-first 失效，永远旧版 |
| SW 注册 URL 不版本化 | SW 更新最长延迟 24h |
| 时间戳当内容哈希用 | 每次部署全量失效 |
| 版本号多处维护 | 产物、URL、SW 各说各话，无法核验 |

## 模板

[sw.js](templates/sw.js) 为通用 Service Worker 骨架：network-first 导航 + 版本化缓存清理。注册代码：

```js
navigator.serviceWorker.register('/sw.js?v=1', { updateViaCache: 'none' });
```
