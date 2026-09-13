import { Suspense, useRef } from 'react'
import { Text } from '@react-three/uikit'
import { Button } from '@react-three/uikit-default'
import * as THREE from 'three'
import type { Vector3Tuple } from 'three'

// toybox 开盒场景的悬浮点击按钮：
// - 直接使用 @react-three/uikit-default 的 Button（ghost variant）
// - 容器尺寸、位置走 R3F 原生事件与 pointer cursor
// - 文字走 MSDF：MSDF JSON 离线预生成（fetcher 异步挂起），运行时零 wasm/worker
// - 按压反馈：pointerDown 时 scale 0.95，up/leave/cancel 时回 1，无过渡动画
// - click 在 pointerup 时自触发：移动端长按后浏览器不合成 click 事件，
//   R3F onClick 拿不到；故用 pointerDownOnButton ref 跟踪 down 是否在本按钮，
//   up 时若仍在按钮上则触发 onClick，不依赖浏览器 click 派发

// 字体资产由 scripts 流程离线生成；加字时需同步扩 TTF 子集与该 JSON（见 memory/脚本）
const MSDF_JSON_URL = '/assets/fonts/uikit_cn.msdf.json'
const FONT_FAMILIES = { default: { normal: MSDF_JSON_URL } }

// 面板世界尺寸：与原 PanelCommButton（scaleX/Y 0.4×0.2）一致
const PANEL_SIZE_X = 0.4
const PANEL_SIZE_Y = 0.2
// px → 世界单位换算率：1px = 0.001 世界单位
const PIXEL_SIZE = 0.001
// 文字世界字高 ≈ fontSize × 0.001 × 字形高占比；70px ≈ 旧 fontSize 0.07 的视觉档位
const FONT_SIZE_PX = 70
// 按压时的缩放（直接 ref 操作，绕过 React state 批处理，无过渡动画）
const PRESS_SCALE = 0.95

export type ToyboxTapButtonProps = {
  position?: Vector3Tuple
  /** 按钮文字（须在字体 MSDF 资产覆盖范围内，见 public/assets/fonts/uikit_cn.msdf.json） */
  label?: string
  onClick?: () => void
}

function ToyboxTapButtonInner({
  position = [0, 0, 0],
  label = '点击打开',
  onClick,
}: ToyboxTapButtonProps) {
  // 内层 group 承载按压缩放（直接 ref 操作，无过渡动画）
  const scaleRef = useRef<THREE.Group>(null)
  // 跟踪 pointerdown 是否发生在本按钮：仅当 down→up 同在本按钮才触发 click
  const pointerDownOnButton = useRef(false)

  const handlePointerDown = () => {
    pointerDownOnButton.current = true
    scaleRef.current?.scale.setScalar(PRESS_SCALE)
  }

  // up 时若 down 也在本按钮，自触发 onClick（不依赖浏览器 click 合成）
  const handlePointerUp = () => {
    scaleRef.current?.scale.setScalar(1)
    if (!pointerDownOnButton.current) return
    pointerDownOnButton.current = false
    onClick?.()
  }

  // pointer 离开或取消：复位，不触发 click
  const handlePointerCancel = () => {
    scaleRef.current?.scale.setScalar(1)
    pointerDownOnButton.current = false
  }

  return (
    <group position={position}>
      <group ref={scaleRef}>
        {/* variant=ghost：默认无背景，方便我们自己覆写为半透明白底；
            outline 自带 borderWidth=1 灰色边、不够亮；用 ghost + 自覆 borderColor/Width 更直接 */}
        <Button
          variant="ghost"
          fontFamilies={FONT_FAMILIES}
          width={PANEL_SIZE_X / PIXEL_SIZE}
          height={PANEL_SIZE_Y / PIXEL_SIZE}
          pixelSize={PIXEL_SIZE}
          borderRadius={24}
          borderColor="#ffffff"
          borderWidth={4}
          backgroundColor="rgba(255, 255, 255, 0.30)"
          hover={{ backgroundColor: 'rgba(255, 255, 255, 0.55)' }}
          cursor="pointer"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerCancel}
          onPointerCancel={handlePointerCancel}
        >
          <Text fontSize={FONT_SIZE_PX} color="#ffffff">
            {label}
          </Text>
        </Button>
      </group>
    </group>
  )
}

export default function ToyboxTapButton(props: ToyboxTapButtonProps) {
  // 字体 JSON 走 fetch 异步加载，挂起时面板整块等就绪再出现（避免豆腐块闪现）
  return (
    <Suspense fallback={null}>
      <ToyboxTapButtonInner {...props} />
    </Suspense>
  )
}
