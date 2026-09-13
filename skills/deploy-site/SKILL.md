---
name: deploy-site
description: 把 BruceWWorld 静态站点构建并部署到腾讯云服务器 svalbardpost.xyz（root@111.229.101.32）。当用户说「部署网站」「重新部署」「上线」「发布页面」「推上服务器」「deploy」时使用。含构建、上传、备份、切换、线上校验与回滚步骤。
agent_created: true
---

# 部署网站 → svalbardpost.xyz

## 触发条件
用户说「部署网站 / 重新部署 / 上线 / 发布 / 推上去 / deploy」等。

## 执行

```bash
npm run deploy
```

等价于 `npm run build`（`tsc -b && vite build`）+ `node scripts/deploy.mjs`。

## 跑之前的三项检查

1. **SSH 免密通道可用**
   ```bash
   ssh -o BatchMode=yes -o ConnectTimeout=15 root@111.229.101.32 'echo ok'
   ```
   必须输出 `ok`。失败见下方「排错」。
2. **合规内容没退化**——`index.html` 里的两个备案链接与 `<title>` 仍在。
3. **建议（非必须）**：工作树干净时再部署，方便线上产物对应一个明确 SHA。验证性迭代部署不必等 commit。

## scripts/deploy.mjs 做了什么

1. `tar` 打包 `dist/` → ssh 传到服务器 `/tmp/bww-stage`
2. **远端校验**：`index.html` 含 `beian.miit.gov.cn` 与 `beian.mps.gov.cn`；`assets/glb/toybox.glb`、`assets/hdr/starter_space.hdr` 存在
3. **备份现场**：`tar -czf /root/web-backups/html-<时间戳>.tar.gz -C /var/www/html .`
4. `rm -rf /var/www/html/assets` 后整目录覆盖（所以本地删掉的资源会同步消失）
5. `chown -R root:root` + `chmod -R a+rX`
6. 清暂存区 → 外网 `fetch https://svalbardpost.xyz/` 校验

## 服务器事实（已侦察确认）

| 项 | 值 |
|---|---|
| 主机 | `root@111.229.101.32`（VM-0-12-ubuntu · Ubuntu 24.04 · nginx 1.24.0） |
| 站点根目录 | `/var/www/html` |
| nginx 站点配置 | `/etc/nginx/sites-enabled/default`（80 块 301 跳 HTTPS；443 块服务静态站） |
| 证书 | `/etc/letsencrypt/live/svalbardpost.xyz/`，certbot `authenticator=nginx` 自动续期 |
| 备份目录 | `/root/web-backups/`（`html-*.tar.gz` 站点快照、`nginx-default-*.conf` 配置快照） |

## 部署后校验

```bash
curl -sI --noproxy '*' -m 20 https://svalbardpost.xyz/ | head -1
curl -s  --noproxy '*' -o /dev/null -m 20 -w "http -> %{http_code} %{redirect_url}\n" http://svalbardpost.xyz/
curl -s  --noproxy '*' -m 20 https://svalbardpost.xyz/ | grep -oE '京ICP备[^<]*|京公网安备[^<]*'
```

## 回滚

```bash
# 看有哪些快照
ssh root@111.229.101.32 'ls -lt /root/web-backups/ | head'
# 站点回滚
ssh root@111.229.101.32 'tar -xzf /root/web-backups/html-<时间戳>.tar.gz -C /var/www/html && chown -R root:root /var/www/html'
# nginx 配置回滚
ssh root@111.229.101.32 'cp /root/web-backups/nginx-default-<时间戳>.conf /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx'
```

## 排错

- **`Permission denied (publickey)`**：本机公钥（`~/.ssh/id_ed25519.pub`，注释 `bruce-windows`）不在服务器 `/root/.ssh/authorized_keys`。用腾讯云控制台 OrcaTerm（以 root 登录）执行：
  `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '<公钥内容>' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
- **本机有 HTTP 代理**（`127.0.0.1:57006`）：curl 访问 localhost 或线上要加 `--noproxy '*'`；跑 playwright 等要清 `HTTP_PROXY/HTTPS_PROXY`。
- **`git commit` 后 ref 不落盘**（本环境特性）：commit 后须手动补 ref 再 push——
  `mkdir -p .git/refs/heads/<父目录> && printf "%s\n" "$(git rev-parse HEAD)" > .git/refs/heads/<branch>`
  ref 已丢时，从 `.git/logs/HEAD` 末行取 SHA。ref 文件里必须是**完整 40 位 SHA**。
- **⚠️ 不要在 `public/` 上用 `git rm`**：本环境曾出现整个 `public/` 被清空的严重事故。删单文件用 `rm <file>` + `git add -A <dir>`，删完立刻 `find public -type f` 复核；出事用 `git restore --source=HEAD --staged --worktree -- public/` 恢复。
- **⚠️ 远端 / 提交类操作必须非沙箱前台执行**：沙箱化的命令**读不到 `C:\Users\bruce\.ssh`**（`Host key verification failed` / `hostkeys_foreach failed ... Permission denied`），而**后台任务（run_in_background）默认沙箱化** → ssh / scp / 部署脚本在后台必然失败。规则：`npm run deploy` 与所有 ssh / scp / git 提交推送**放前台并关闭沙箱**，不要丢后台。
- **`pkill -f "<pattern>"` 会自匹配当前命令行**：命令里出现同样字符串就会把自己杀掉（退出码 255）。用括号技巧规避，例如 `pkill -9 -f "[c]ertbot renew"`。
- 若 `certbot` 报 `Another instance of Certbot is already running`（多为被中断的任务留下），先清进程与 `/var/lib/letsencrypt/.certbot.lock`、`/var/log/letsencrypt/.certbot.lock`。
- **Windows 本机 SSH 必须带 `-4`**：本机网络 IPv6 不通到 `111.229.101.32`，默认解析优先 IPv6 会超时（`Connection timed out`）。所有预检/回滚命令里的 `ssh root@111.229.101.32` 改写成 `ssh -4 -o ConnectTimeout=20 root@111.229.101.32`。`npm run deploy` 跑的 ssh/scp 由 node 子进程发起也受同一规则约束——脚本内已带 `-o ConnectTimeout`，但需确认走 IPv4，必要时在 `~/.ssh/config` 给 `111.229.101.32` 加 `AddressFamily inet`。注意：Trae Work 远程 Linux 环境无此问题，IPv4 直连即可。
- **Windows PowerShell `curl` 别名到 `Invoke-WebRequest`**：`curl -m` / `curl -s` 会因参数歧义报 `AmbiguousParameter`。部署后校验一律改用 `curl.exe` 显式调用真 curl，例如 `curl.exe -sI --noproxy '*' --max-time 20 https://svalbardpost.xyz/`。

## 合规约束（不可退化）

- `index.html` 必须悬挂 **京ICP备2026056959号-1** → `https://beian.miit.gov.cn/`
- 必须悬挂 **京公网安备11010502062826号** → `https://beian.mps.gov.cn/#/query/webSearch?code=11010502062826`
- `<title>` 与备案网站名称一致：**大同的技术分享**
