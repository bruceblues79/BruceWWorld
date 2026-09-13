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
// - 按压反馈：动画完成后 pointerDown 时 scale 0.95，up/leave/cancel 回 1，无过渡
// - click 在 pointerup 时自触发：移动端长按后浏览器不合成 click 事件，
//   R3F onClick 拿不到；故用 pointerDownOnButton ref 跟踪 down 是否在本按钮，
//   up 时若仍在按钮上则触发 onClick，不依赖浏览器 click 派发
// - 尺寸 0.2 × 0.2 世界单位
//
// 纹理走 R3F useLoader 缓存：与 Toybox 模块加载时的 useLoader.preload 同源，
// 开盒时缓存命中，AltarButtonInner 直接同步拿到纹理，不挂起 Suspense

const BUTTON_SIZE = 0.2
// px → 世界单位换算率：1px = 0.001 世界单位（与 ToyboxTapButton 一致）
const PIXEL_SIZE = 0.001
const POP_DURATION = 0.5
// 按压时的缩放（直接 ref 操作，无过渡动画；仅在弹出动画完成后生效）
const PRESS_SCALE = 0.95

export type AltarButtonProps = {
  position: Vector3Tuple
  /** 图标纹理 URL，如 /assets/textures/altar_heart.png */
  imageSrc: string
  onClick?: () => void
}

function AltarButtonInner({
  position,
  imageSrc,
  onClick,
}: AltarButtonProps) {
  // 走 R3F 缓存取纹理（已由 Toybox 模块加载时 preload 预热）；
  // colorSpace / matrixAutoUpdate 与 uikit 内部 loadTextureImpl 保持一致，
  // three Texture 只能原地修改属性，与 React Compiler immutability 不兼容
  const texture = useLoader(THREE.TextureLoader, imageSrc)
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texture.colorSpace = THREE.SRGBColorSpace
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texture.matrixAutoUpdate = false

  // 内层 group 承载 scale 弹出动画（外层 Billboard 只负责旋转，不缩放）
  const scaleRef = useRef<THREE.Group>(null)
  const [clickable, setClickable] = useState(false)
  // 跟踪 pointerdown 是否发生在本按钮：仅当 down→up 同在本按钮才触发 click
  const pointerDownOnButton = useRef(false)

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
    }
  }, [])

  // 按压缩放直接 ref 操作，无过渡动画；
  // 仅在弹出动画完成后（clickable=true）才生效，避免覆盖 gsap 动画
  const handlePointerDown = () => {
    if (!clickable) return
    pointerDownOnButton.current = true
    scaleRef.current?.scale.setScalar(PRESS_SCALE)
  }

  // up 时若 down 也在本按钮，自触发 onClick（不依赖浏览器 click 合成）
  const handlePointerUp = () => {
    if (!clickable) return
    scaleRef.current?.scale.setScalar(1)
    if (!pointerDownOnButton.current) return
    pointerDownOnButton.current = false
    onClick?.()
  }

  // pointer 离开或取消：复位，不触发 click
  const handlePointerCancel = () => {
    if (!clickable) return
    scaleRef.current?.scale.setScalar(1)
    pointerDownOnButton.current = false
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
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerCancel}
            onPointerCancel={handlePointerCancel}
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
