/// <reference types="vite/client" />
/// <reference types="@iwsdk/vite-plugin-dev/client" />

/** 构建时由 vite.config.ts 的 define 注入，来源为 package.json 的 version */
declare const __APP_VERSION__: string;
