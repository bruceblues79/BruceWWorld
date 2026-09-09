import { Suspense } from 'react'
import { Container, Text } from '@react-three/uikit'
import type { Vector3Tuple } from 'three'

// uikit 面板按钮（试用 @react-three/uikit core 的实验组件）：
// - 布局/描边/背景/hover 均由 uikit yoga 布局与条件样式驱动，无 DOM
// - 点击走 R3F 原生事件，将来 WebXR 射线/手柄由 uikit pointer 体系接管
// - 文字走 MSDF：useTTF 运行时转换在本仓库构建链下 worker/wasm 资产无法命中
//   （emscripten 的 new URL('msdfgen_wasm.wasm', import.meta.url) 未被 vite emit），
//   故改为离线预生成 MSDF JSON（msdfgen-wasm，Node 侧一次转换），运行时零 wasm。

// 字体资产由 scripts 流程离线生成；加字时需同步扩 TTF 子集与该 JSON（见 memory/脚本）
const MSDF_JSON_URL = '/assets/fonts/uikit_cn.msdf.json'
// family 名固定 default（uikit Text 未显式指定 fontFamily 时的查找键）
const FONT_FAMILIES = { default: { normal: MSDF_JSON_URL } }

// 面板世界尺寸：与原 PanelCommButton（scaleX/Y 0.4×0.2）一致
const PANEL_SIZE_X = 0.4
const PANEL_SIZE_Y = 0.2
// px → 世界单位换算率：1px = 0.001 世界单位
const PIXEL_SIZE = 0.001
// 文字世界字高 ≈ fontSize × 0.001 × 字形高占比；70px ≈ 旧 fontSize 0.07 的视觉档位
const FONT_SIZE_PX = 70

export type UiKitPanelButtonProps = {
  position?: Vector3Tuple
  /** 按钮文字（须在字体 MSDF 资产覆盖范围内，见 public/assets/fonts/uikit_cn.msdf.json） */
  label?: string
  onClick?: () => void
}

function UiKitPanelButtonInner({
  position = [0, 0, 0],
  label = '点击打开',
  onClick,
}: UiKitPanelButtonProps) {
  return (
    <group position={position}>
      <Container
        fontFamilies={FONT_FAMILIES}
        sizeX={PANEL_SIZE_X}
        sizeY={PANEL_SIZE_Y}
        pixelSize={PIXEL_SIZE}
        backgroundColor="rgba(255, 255, 255, 0.10)"
        borderColor="#ffffff"
        borderWidth={2}
        hover={{ backgroundColor: 'rgba(255, 255, 255, 0.32)' }}
        onClick={onClick}
        cursor="pointer"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize={FONT_SIZE_PX} color="#ffffff">
          {label}
        </Text>
      </Container>
    </group>
  )
}

export default function UiKitPanelButton(props: UiKitPanelButtonProps) {
  // 字体 JSON 走 fetch 异步加载，挂起时面板整块等就绪再出现（避免豆腐块闪现）
  return (
    <Suspense fallback={null}>
      <UiKitPanelButtonInner {...props} />
    </Suspense>
  )
}
