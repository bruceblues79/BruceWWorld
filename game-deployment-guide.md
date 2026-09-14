# 游戏子站部署方案

> 记录时间：2026-09-14
> 背景：AltarScreen 的 LiteGameScreen 需要跳转到独立的 R3F 游戏工程（如 DefendTroy），该游戏与主站分开制作，需复用主站服务器部署。

## 一、当前主站部署现状

| 项 | 值 |
|----|-----|
| 服务器 | 腾讯云 `root@111.229.101.32` |
| Web 根目录 | `/var/www/html` |
| 域名 | `https://svalbardpost.xyz/` |
| 备案 | 京ICP备2026056959号-1 + 公安备案 |
| 部署脚本 | `scripts/deploy.mjs`（tar 上传 → 远端校验 → 切换 → 外网校验） |
| 静态服务 | Nginx 直接 serve `/var/www/html`（主站已验证可用） |

## 二、推荐方案：子路径部署

### 2.1 方案说明

把独立游戏工程的产物部署到主站的子目录下：

```
服务器路径：/var/www/html/games/defend-troy/
访问地址：https://svalbardpost.xyz/games/defend-troy/
```

### 2.2 为什么选子路径

| 维度 | 子路径 | 子域名 | 新域名 |
|------|--------|--------|--------|
| 需要新域名 | ❌ | ❌（games.svalbardpost.xyz） | ✅ |
| 需要重新备案 | ❌ | ⚠️ 建议在已有备案下新增子域名 | ✅ |
| 需要改 Nginx | ❌ | ✅ 加 server 块 | ✅ |
| 需要新证书 | ❌ | ✅ certbot 补 | ✅ |
| 复杂度 | 低 | 中 | 高 |

**结论：子路径最简，复用现有域名/备案/Nginx/证书，零额外申请。**

## 三、实施步骤

### 3.1 游戏工程 Vite 配置

游戏是独立工程，`vite.config.ts` 必须设 `base`，否则打包后资源路径从根目录找，404：

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/games/defend-troy/',  // ← 关键：与部署子路径一致
})
```

### 3.2 游戏工程部署脚本

游戏工程单独写 deploy 脚本，逻辑同主站 `scripts/deploy.mjs`，目标路径改为子目录：

```js
const REMOTE_ROOT = '/var/www/html/games/defend-troy'
```

核心流程（参考主站 deploy.mjs）：
1. `npm run build`
2. tar 上传到服务器暂存区 `/tmp/game-stage`
3. 远端校验 `index.html` 存在
4. 清旧 `rm -rf ${REMOTE_ROOT}/*`
5. 拷贝切换 `cp -a ${STAGE}/. ${REMOTE_ROOT}/`
6. 归一权限 `chmod 644` / `chmod 755`
7. 外网校验 `curl -I https://svalbardpost.xyz/games/defend-troy/` 返回 200

### 3.3 主站配置跳转 URL

在主站 `src/components/screens/LiteGameScreen.tsx` 的 `GAMES` 数组中填写：

```ts
{
  id: 'defend_troy',
  name: 'DefendTroy',
  image: '/assets/textures/game_def_troy.png',
  url: 'https://svalbardpost.xyz/games/defend-troy/',
}
```

点选 → 确定 → `window.open(url, '_blank')` 新标签页打开游戏。

## 四、备案说明

| 方案 | 备案要求 |
|------|---------|
| 子路径 `svalbardpost.xyz/games/xxx/` | 主域名备案自动覆盖，**无需任何操作** |
| 子域名 `games.svalbardpost.xyz` | 严格来说应在已有备案下新增子域名记录；个人站一般不查，但建议补登记 |
| 全新域名 | 需重新跑 ICP 备案 + 公安备案（约 20 工作日） |

当前用子路径，**无需申请任何备案或域名**。

## 五、备选：子域名隔离（游戏多了再考虑）

如果将来游戏超过 3-5 个，想用 `games.svalbardpost.xyz` 统一管理：

1. **DNS**：阿里云 DNS 加 A 记录 `games` → `111.229.101.32`
2. **Nginx**：新增 server 块
   ```nginx
   server {
       listen 443 ssl;
       server_name games.svalbardpost.xyz;
       root /var/www/games;
       index index.html;
       # SSL 证书用 certbot 申请
   }
   ```
3. **证书**：`certbot --nginx -d games.svalbardpost.xyz`
4. **备案**：在 ICP 备案系统里把 `games.svalbardpost.xyz` 加到 `svalbardpost.xyz` 的备案下

单个 DefendTroy 不建议走这条路，子路径足够。

## 六、验证清单

- [ ] 游戏工程 `vite.config.ts` 设了 `base: '/games/defend-troy/'`
- [ ] `npm run build` 后 `dist/index.html` 里资源路径是 `/games/defend-troy/assets/xxx`
- [ ] 部署后 `curl -I https://svalbardpost.xyz/games/defend-troy/` 返回 200
- [ ] 主站点选 DefendTroy → 确定 → 新标签页打开游戏
- [ ] 游戏页面资源（JS/CSS/GLB/HDR）全部 200，无 404
