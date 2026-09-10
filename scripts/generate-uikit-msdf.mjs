// 生成 uikit 中文 MSDF 字体资产：public/assets/fonts/uikit_cn.msdf.json
//
// 背景：@react-three/uikit 的 Text 用 MSDF 字体，默认仅含拉丁字符。
// useTTF（运行时 WASM 转换）在本仓库构建链下不可用 —— emscripten 的
// new URL('msdfgen_wasm.wasm', import.meta.url) 位于 worker 产物内，
// vite/rolldown 不会 emit 该 wasm，运行时静默 404 导致 Suspense 无限挂起。
// 故改为 Node 侧离线转换一次（本脚本），运行时零 wasm/worker。
//
// 用法：npm i -D msdfgen-wasm && node scripts/generate-uikit-msdf.mjs
// 前置：uikit_cn.ttf 需先含目标字符（见 generate-uikit-ttf.py）；加字流程：
//   1) 扩 generate-uikit-ttf.py 的 charset 并重跑（woff 母体 → 子集 TTF）
//   2) 扩本脚本 CHAR 并重跑本脚本
// 产出为 uikit FontInfo 同款 bmfont 结构、pages 内联 dataURL（与 @pmndrs/msdfonts 分发格式一致）。
import fs from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const { Msdfgen } = require('msdfgen-wasm')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TTF = join(ROOT, 'public/assets/fonts/uikit_cn.ttf')
const OUT = join(ROOT, 'public/assets/fonts/uikit_cn.msdf.json')

const SIZE = 48 // 字形栅格化分辨率（与 uikit TTFLoader 默认一致）
const RANGE = 4 // MSDF 距离场范围（px）
const PADDING = 2

// 必须与 TTF 子集字符集一致，且涵盖所有 UI 文案字符
const CHAR = '点击打开 '

const round = (x) => Math.round(x * 100) / 100

const wasm = fs.readFileSync(
  // msdfgen-wasm 的 exports 不暴露 ./package.json，从入口 js（dist/cjs|esm/index.js）推导 wasm 位置
  join(dirname(require.resolve('msdfgen-wasm')), '../../wasm/msdfgen.wasm'),
)
const msdfgen = await Msdfgen.create(wasm)
msdfgen.loadFont(fs.readFileSync(TTF))
await msdfgen.loadGlyphs([...CHAR].map((c) => c.codePointAt(0)), { preprocess: true })

const bins = msdfgen.packGlyphs(
  { size: SIZE, range: RANGE },
  { maxWidth: 512, maxHeight: 512, padding: PADDING, pot: true },
)
if (bins.length > 1) throw new Error(`需要多页图集(${bins.length})，当前实现仅支持单页`)

const bin = bins[0]
const { metrics } = msdfgen
const png = msdfgen.createAtlasImage(bin)
const dataURL = `data:image/png;base64,${Buffer.from(png).toString('base64')}`

const font = {
  pages: [dataURL],
  chars: bin.rects.map((r) => {
    const g = r.glyph
    return {
      id: g.unicode,
      index: g.index,
      char: String.fromCodePoint(g.unicode),
      width: r.width,
      height: r.height,
      xoffset: round(g.left * SIZE),
      yoffset: round((metrics.ascenderY - g.top) * SIZE),
      xadvance: round(g.advance * SIZE),
      chnl: 15,
      x: r.x,
      y: r.y,
      page: 0,
    }
  }),
  info: {
    face: 'uikit_cn',
    size: SIZE,
    bold: 0,
    italic: 0,
    charset: [...CHAR],
    unicode: 1,
    stretchH: 100,
    smooth: 1,
    aa: 1,
    padding: [PADDING, PADDING, PADDING, PADDING],
    spacing: [1, 1],
    outline: 0,
  },
  common: {
    lineHeight: round(metrics.lineHeight * SIZE),
    base: round(metrics.ascenderY * SIZE),
    scaleW: bin.width,
    scaleH: bin.height,
    pages: 1,
    packed: 0,
    alphaChnl: 0,
    redChnl: 0,
    greenChnl: 0,
    blueChnl: 0,
  },
  distanceField: { fieldType: 'msdf', distanceRange: RANGE },
  kernings: [],
}

fs.writeFileSync(OUT, JSON.stringify(font))
console.log(
  `OK -> ${OUT}\nchars=${font.chars.length} atlas=${bin.width}x${bin.height} png=${(png.length / 1024).toFixed(0)}KB`,
)
