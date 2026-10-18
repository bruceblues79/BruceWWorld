/*
 * 通用破缓存 Service Worker 骨架（与具体框架无关）。
 * 职责边界：只管"导航请求在线优先"，其余交给 HTTP 缓存 + 内容哈希。
 * 逻辑变更时：递增 VERSION，并同步递增注册 URL 的 ?v= 参数。
 */
const VERSION = 'sw-v1';

self.addEventListener('install', () => {
  // 不预缓存任何 HTML——导航请求必须 network-first。
  // activate 阶段统一 claim，跳过等待期。
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // 清理所有旧版本缓存命名空间
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== VERSION).map((name) => caches.delete(name)),
      );
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.mode === 'navigate') {
    // 在线：永远拿网络的最新 HTML；离线：回退缓存副本
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
  // 非导航请求不拦截：资产失效由内容哈希文件名负责，SW 不越权。
});
