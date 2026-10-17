#!/usr/bin/env node
/**
 * BruceWWorld deployment script.
 * Publishes dist/ to the site root:
 *   root@111.229.101.32 /var/www/html
 *
 * Flow: tar upload → remote verify index.html + beian → switch → fix perms → cleanup → external check
 * Usage: npm run deploy (equivalent to npm run build + node scripts/deploy.mjs)
 * Rollback: git checkout <prev> + npm run deploy
 *
 * Root-path safety: only clear ${REMOTE_ROOT}/assets before overlay-switch,
 * so siblings like games/ on the server stay intact.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const HOST = 'root@111.229.101.32';
const REMOTE_ROOT = '/var/www/html';
const STAGE = '/tmp/svalbradpost-stage';
const SITE = 'https://svalbardpost.xyz/';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const runRemote = (script) =>
  execSync(`ssh -o BatchMode=yes ${HOST} bash -s`, {
    input: script,
    stdio: ['pipe', 'inherit', 'inherit'],
  });

if (!existsSync('dist/index.html')) {
  console.error('未找到 dist/index.html —— 请先执行 npm run build');
  process.exit(1);
}

console.log('[1/4] 打包 dist 并上传到服务器暂存区 ...');
execSync(
  `tar -czf - -C dist . | ssh -o BatchMode=yes ${HOST} "rm -rf ${STAGE} && mkdir -p ${STAGE} && tar -xzf - -C ${STAGE}"`,
  { stdio: 'inherit' },
);

console.log('[2/4] 远端校验 + 切换 ...');
runRemote(`
set -e
test -f ${STAGE}/index.html
grep -q 京ICP备 ${STAGE}/index.html
grep -q 京公网安备 ${STAGE}/index.html
find ${STAGE} -type d -exec chmod 755 {} +
find ${STAGE} -type f -exec chmod 644 {} +
rm -rf ${REMOTE_ROOT}/assets
cp -a ${STAGE}/. ${REMOTE_ROOT}/
chown -R root:root ${REMOTE_ROOT}
chmod -R a+rX ${REMOTE_ROOT}
echo "  暂存文件数: $(find ${STAGE} -type f | wc -l)"
echo "  已切换 ${REMOTE_ROOT}"
`);

console.log('[3/4] 清理暂存区 ...');
runRemote(`rm -rf ${STAGE}`);

console.log('[4/4] 外网校验 ...');
const res = await fetch(SITE);
if (!res.ok) throw new Error(`${SITE} 返回 HTTP ${res.status}`);
const html = await res.text();
if (!html.includes('<title>')) throw new Error('线上页面缺少 <title>');
if (!html.includes('京ICP备') || !html.includes('京公网安备')) {
  throw new Error('线上页面缺少备案悬挂');
}
console.log(`  ${SITE} → HTTP ${res.status}，页面结构与备案悬挂齐全`);
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
console.log(`  访问地址（强刷直达最新）: ${SITE}?v=${version}-${stamp}`);
console.log('部署完成');
