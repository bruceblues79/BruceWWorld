import { Card } from '@react-three/uikit-default'
import { Billboard } from '@react-three/drei'
import type { Vector3Tuple } from 'three'

// AltarScreen：祭坛场景的悬浮内容面板（壳），固定挂载在 starter canvas 世界坐标
// [0, 1, -1.25]，介于相机与 toybox 之间。外层 drei Billboard 始终朝向相机，
// 保证 OrbitControls 环绕时面板始终可见可读。当前为空壳：ghost 风格半透明白底
// + 圆角白边，0.6×0.7 世界单位。后续在容器内扩展按钮/文字/图片等内容。
//
// 用 uikit-default 的 Card（官方默认面板，继承 Container 并预设背景/圆角/边框），
// 与 AltarButton/ToyboxTapButton 的 Button 同套 defaultOverrides 渲染路径。
// 注意：本版本 uikit 的裸 Container 需要配合 Fullscreen（走 Root 上下文）才能渲染，
// 不适用于 3D 场景中的局部世界坐标面板；默认面板一律用 Card 当底。
//
// 尺寸换算：1px = 0.001 世界单位（与 AltarButton/ToyboxTapButton 一致），0.6m → 600px。
// 透明度走 rgba 字符串（与现有 Button 一致；本版本 uikit 无独立 backgroundOpacity prop）。

const PANEL_WIDTH = 0.6 / 0.001
const PANEL_HEIGHT = 0.8 / 0.001
const PIXEL_SIZE = 0.001

export type AltarScreenProps = {
  position?: Vector3Tuple
}

export default function AltarScreen({
  position = [0, 1, -1.25],
}: AltarScreenProps) {
  return (
    <group position={position}>
      <Billboard>
        <Card
          width={PANEL_WIDTH}
          height={PANEL_HEIGHT}
          pixelSize={PIXEL_SIZE}
          borderRadius={24}
          borderColor="#ffffff"
          borderWidth={4}
          backgroundColor="rgba(255, 255, 255, 0.25)"
          depthWrite={false}
          renderOrder={10}
        />  
      </Billboard>
    </group>
  )
}
