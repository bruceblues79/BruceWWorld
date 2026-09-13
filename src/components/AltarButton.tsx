import { Suspense, useEffect, useRef, useState } from 'react'
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
// - 尺寸 0.2 × 0.2 世界单位

const BUTTON_SIZE = 0.2
// px → 世界单位换算率：1px = 0.001 世界单位（与 ToyboxTapButton 一致）
const PIXEL_SIZE = 0.001
const POP_DURATION = 0.5

export type AltarButtonProps = {
  position: Vector3Tuple
  /** 图标纹理 URL，如 /assets/textures/altar_heart.png */
  imageSrc: string
  onClick?: () => void
}

function AltarButtonInner({ position, imageSrc, onClick }: AltarButtonProps) {
  // 内层 group 承载 scale 弹出动画（外层 Billboard 只负责旋转，不缩放）
  const scaleRef = useRef<THREE.Group>(null)
  const [clickable, setClickable] = useState(false)

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
            onClick={clickable ? onClick : undefined}
            onPointerDown={(e) => {
              // 阻止浏览器长按手势判定（callout 菜单/全屏闪），不影响 uikit 内部 click 合成
              ;(e.nativeEvent as PointerEvent).preventDefault()
            }}
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
          >
            <Image
              src={imageSrc}
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
