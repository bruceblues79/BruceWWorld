import { Suspense, useEffect, useRef, useState } from 'react'
import { useLoader } from '@react-three/fiber'
import { Image } from '@react-three/uikit'
import { Button } from '@react-three/uikit-default'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import type { Vector3Tuple } from 'three'

// toybox 开盒后挂在祭坛节点上的次级连接按钮：
// - 无文字，白底 0.2 透明度 + 对应 PNG 图标
// - 外层 drei Billboard 始终朝向相机
// - 挂载时 scale 0 → 1 的 0.5s 弹出动画（easeIn），动画完成后方可点击
// - 按压反馈：直接 ref 操作 scale 0.95，绕过 React state 批处理
// - 可配置长按阈值 longPressMs，到时触发 onLongPress 并抑制 onClick
// - 尺寸 0.2 × 0.2 世界单位
//
// 纹理走 R3F useLoader 缓存：与 Toybox 模块加载时的 useLoader.preload 同源，
// 开盒时缓存命中，AltarButtonInner 直接同步拿到纹理，不挂起 Suspense

const BUTTON_SIZE = 0.2
// px → 世界单位换算率：1px = 0.001 世界单位（与 ToyboxTapButton 一致）
const PIXEL_SIZE = 0.001
const POP_DURATION = 0.5
const PRESS_SCALE = 0.95

export type AltarButtonProps = {
  position: Vector3Tuple
  /** 图标纹理 URL，如 /assets/textures/altar_heart.png */
  imageSrc: string
  onClick?: () => void
  /** 长按阈值（ms），达到后触发 onLongPress 并抑制 onClick，默认 500 */
  longPressMs?: number
  onLongPress?: () => void
}

function AltarButtonInner({
  position,
  imageSrc,
  onClick,
  longPressMs = 500,
  onLongPress,
}: AltarButtonProps) {
  // 走 R3F 缓存取纹理（已由 Toybox 模块加载时 preload 预热）；
  // colorSpace / matrixAutoUpdate 与 uikit 内部 loadTextureImpl 保持一致，
  // three Texture 只能原地修改属性，与 React Compiler immutability 不兼容
  const texture = useLoader(THREE.TextureLoader, imageSrc)
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texture.colorSpace = THREE.SRGBColorSpace
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texture.matrixAutoUpdate = false

  // 内层 group 承载 scale 弹出动画 + 按压反馈（外层 Billboard 只负责旋转，不缩放）
  const scaleRef = useRef<THREE.Group>(null)
  const [clickable, setClickable] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  useEffect(() => {
    const g = scaleRef.current
    if (!g) return
    g.scale.setScalar(0)
    const tween = gsap.to(g.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: POP_DURATION,
      ease: 'power1.in',
      onComplete: () => setClickable(true),
    })
    return () => {
      tween.kill()
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  // 直接 ref 操作 scale，绕过 React state 批处理（解决 Chrome 快速点击不缩小）
  const handlePointerDown = () => {
    if (!clickable) return
    scaleRef.current?.scale.setScalar(PRESS_SCALE)
    longPressFired.current = false
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true
        onLongPress()
      }, longPressMs)
    }
  }

  const handlePointerUp = () => {
    scaleRef.current?.scale.setScalar(1)
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleClick = () => {
    // 长按已触发则抑制 click
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    onClick?.()
  }

  return (
    <group position={position}>
      <Billboard>
        <group ref={scaleRef}>
          <Button
            variant="ghost"
            width={BUTTON_SIZE / PIXEL_SIZE}
            height={BUTTON_SIZE / PIXEL_SIZE}
            pixelSize={PIXEL_SIZE}
            borderRadius={24}
            borderColor="#ffffff"
            borderWidth={4}
            backgroundColor="rgba(255, 255, 255, 0.2)"
            depthWrite={false}
            renderOrder={10}
            paddingTop={0}
            paddingBottom={0}
            paddingLeft={0}
            paddingRight={0}
            cursor={clickable ? 'pointer' : 'default'}
            onClick={clickable ? handleClick : undefined}
            onPointerDown={clickable ? handlePointerDown : undefined}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
          >
            <Image
              src={texture}
              width="100%"
              height="100%"
              objectFit="cover"
            />
          </Button>
        </group>
      </Billboard>
    </group>
  )
}

export default function AltarButton(props: AltarButtonProps) {
  // uikit Image 加载纹理会挂起，整块等就绪再出现
  return (
    <Suspense fallback={null}>
      <AltarButtonInner {...props} />
    </Suspense>
  )
}
