// public 静态资源 URL 版本化辅助：构建时通过 vite.config.ts 的 define 注入
// __BUILD_VERSION__（UTC 时间戳），此处包装路径为 `${path}?v=${版本号}`，
// 让浏览器在每次部署后自动重新下载资源，无需用户清缓存。
// 调用方在 src/components/* 与 src/spaces/* 中所有硬编码 /assets/ 路径的位置。

/** 给 public 静态资源路径追加构建版本号查询参数 */
export function versionedUrl(path: string): string {
  return `${path}?v=${__BUILD_VERSION__}`
}
