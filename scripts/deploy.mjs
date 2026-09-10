#!/usr/bin/env node
/**
 * 一键部署：把 dist/ 发布到腾讯云 svalbardpost.xyz（root@111.229.101.32）
 *
 * 流程：打包上传暂存区 → 远端校验（备案链接 + 关键资产）→ 备份现有目录
 *       → 清旧 assets 并切换 → 归一属主/权限 → 清理 → 外网校验
 * 用法：npm run deploy（等价于 npm run build + node scripts/deploy.mjs）
 * 回滚：服务器上 /root/web-backups/html-<时间戳>.tar.gz 解开覆盖 /var/www/html 即可
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const HOST = 'root@111.229.101.32'
const REMOTE_ROOT = '/var/www/html'
const STAGE = '/tmp/bww-stage'
const SITE = 'https://svalbardpost.xyz/'

// 远端脚本统一经 stdin 传给 bash -s，避免本地 shell（cmd/PowerShell/Git Bash）引号转义差异
const runRemote = (script) =>
  execSync(`ssh -o BatchMode=yes ${HOST} bash -s`, {
    input: script,
    stdio: ['pipe', 'inherit', 'inherit'],
  })

if (!existsSync('dist/index.html')) {
  console.error('未找到 dist/index.html —— 请先执行 npm run build')
  process.exit(1)
}

console.log('[1/4] 打包 dist 并上传到服务器暂存区 ...')
execSync(
  `tar -czf - -C dist . | ssh -o BatchMode=yes ${HOST} "rm -rf ${STAGE} && mkdir -p ${STAGE} && tar -xzf - -C ${STAGE}"`,
  { stdio: 'inherit' },
)

console.log('[2/4] 远端校验 + 备份 + 切换 ...')
runRemote(`
set -e
test -f ${STAGE}/index.html
grep -q beian.miit.gov.cn ${STAGE}/index.html
grep -q beian.mps.gov.cn ${STAGE}/index.html
test -f ${STAGE}/assets/glb/toybox.glb
test -f ${STAGE}/assets/hdr/starter_space.hdr
find ${STAGE} -type d -exec chmod 755 {} +
find ${STAGE} -type f -exec chmod 644 {} +
mkdir -p /root/web-backups
tar -czf /root/web-backups/html-$(date +%Y%m%d-%H%M%S).tar.gz -C ${REMOTE_ROOT} .
rm -rf ${REMOTE_ROOT}/assets
cp -a ${STAGE}/. ${REMOTE_ROOT}/
chown -R root:root ${REMOTE_ROOT}
chmod -R a+rX ${REMOTE_ROOT}
echo "  暂存文件数: $(find ${STAGE} -type f | wc -l)"
echo "  已备份旧站到 /root/web-backups/"
echo "  已切换 ${REMOTE_ROOT}"
`)

console.log('[3/4] 清理暂存区 ...')
runRemote(`rm -rf ${STAGE}`)

console.log('[4/4] 外网校验 ...')
const res = await fetch(SITE)
if (!res.ok) throw new Error(`${SITE} 返回 HTTP ${res.status}`)
const html = await res.text()
for (const marker of ['京ICP备2026056959号-1', 'beian.miit.gov.cn', 'beian.mps.gov.cn', '<title>']) {
  if (!html.includes(marker)) throw new Error(`线上页面缺少 ${marker}`)
}
console.log(`  ${SITE} → HTTP ${res.status}，备案悬挂与页面结构齐全`)
console.log('部署完成')
