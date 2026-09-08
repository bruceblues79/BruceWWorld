import { Text } from '@react-three/drei'
import { useEffect, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Vector3Tuple } from 'three'
import PanelComm from './PanelComm'

export type PanelCommButtonProps = {
  position?: Vector3Tuple
  scale?: number
  scaleX?: number
  scaleY?: number
  /** 按钮文字 */
  label?: string
  /** troika 字体文件 url，默认用内置中文子集字体 */
  font?: string
  /** 常态边框 tint */
  color?: string
  /** hover 时边框 tint */
  hoverColor?: string
  /** 文字颜色 */
  textColor?: string
  onClick?: () => void
}

const FONT_SIZE = 0.14
const TEXT_Z = 0.03 // 高于边框件最前缘（z≈0.015），避免深度冲突
// 中文默认字体：Noto Sans SC 子集（GB2312 常用字 + ASCII + 常用标点，woff 1.4MB），
// 运行时按需加载、不进 JS bundle；字符集外的生僻字需重新子集化扩充
const DEFAULT_FONT_URL = '/assets/fonts/panel_comm_font.woff'

// 组合 PanelComm 的可点击面板按钮：
// 点击区域不需要额外透明 plane —— R3F 事件会从被射线命中的子 mesh 沿场景图向上冒泡，
// 挂在 group 上即可覆盖整个九宫格（边框 + 中心板）。
export default function PanelCommButton({
  position = [0, 0, 0],
  scale = 1,
  scaleX = 1,
  scaleY = 1,
  label = 'button',
  font = DEFAULT_FONT_URL,
  color = '#ffffff',
  hoverColor = '#c0c0c0',
  textColor = '#ffffff',
  onClick,
}: PanelCommButtonProps) {
  const [hovered, setHovered] = useState(false)

  // hover 时显示手型光标，离开/卸载自动还原
  useEffect(() => {
    if (!hovered) return
    document.body.style.cursor = 'pointer'
    return () => {
      document.body.style.cursor = ''
    }
  }, [hovered])

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHovered(true)
  }
  const handleOut = () => setHovered(false)
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onClick?.()
  }

  return (
    <group
      position={position}
      scale={scale}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onClick={handleClick}
    >
      <PanelComm
        scaleX={scaleX}
        scaleY={scaleY}
        tint={hovered ? hoverColor : color}
      />
      <Text
        position={[0, 0, TEXT_Z]}
        fontSize={FONT_SIZE}
        font={font}
        anchorX="center"
        anchorY="middle"
        color={textColor}
      >
        {label}
      </Text>
    </group>
  )
}
