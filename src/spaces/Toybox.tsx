import { useEffect, useRef } from 'react'
import { Html, useGLTF } from '@react-three/drei'
import gsap from 'gsap'

const MODEL_URL = '/assets/glb/toybox.glb'
// 整个 toybox + tap 按钮的「世界锚点」
const MODEL_POSITION: [number, number, number] = [0, 0.3, -2]
// tap 按钮在 toybox 局部坐标中的偏移，与模型保持相对位置（相机旋转时随之一起运动）
const TAP_LOCAL_OFFSET: [number, number, number] = [0, 0.15, 0.25]

// 开盒动画：三段均以「增量」驱动 —— 节点自带 Blender 初始姿态（root_hinge 已绕 z 180°、
// root_rotate 已绕 y 90°），绝对目标会让后两段失去动作。
const HINGE_SPIN = Math.PI // root_hinge 再绕局部 z 转 180°
const ROOT_SHIFT_X = -0.6 // root（glb 场景根）沿局部 x 平移
const ROTATE_TURN = Math.PI / 2 // root_rotate 再绕局部 y 转 90°
const PAUSE_SECONDS = 0.3 // 段间停顿
const EASE = 'power2.inOut'

export type Phase = 'default' | 'opening' | 'opened'

interface ToyboxProps {
  phase: Phase
  onTapStart: () => void
  onOpened: () => void
}

function Toybox({ phase, onTapStart, onOpened }: ToyboxProps) {
  const { scene } = useGLTF(MODEL_URL)

  // 用 ref 持有最新回调，避免动画 effect 因回调引用变化而重建/重播
  const onOpenedRef = useRef(onOpened)
  useEffect(() => {
    onOpenedRef.current = onOpened
  }, [onOpened])

  useEffect(() => {
    if (phase !== 'opening') return
    // glb 场景根节点名即 root，因此 root 就是 scene 本体
    const hinge = scene.getObjectByName('root_hinge')
    const rotate = scene.getObjectByName('root_rotate')
    if (!hinge || !rotate) return // 节点缺失时静默，不打断进入 opened 的流程

    const tl = gsap.timeline({ onComplete: () => onOpenedRef.current() })
    tl.to(hinge.rotation, { z: `+=${HINGE_SPIN}`, duration: 1, ease: EASE })
      .to(
        scene.position,
        { x: `+=${ROOT_SHIFT_X}`, duration: 0.6, ease: EASE },
        `+=${PAUSE_SECONDS}`,
      )
      .to(
        rotate.rotation,
        { y: `+=${ROTATE_TURN}`, duration: 1, ease: EASE },
        `+=${PAUSE_SECONDS}`,
      )
    return () => {
      tl.kill()
    }
  }, [phase, scene])

  return (
    // model 与 tap 同处一个 group：tap 用局部偏移挂在此 group 下，
    // 转动视角时 tap 始终保持与 toybox 的相对空间位置。
    <group position={MODEL_POSITION}>
      <primitive object={scene} />
      {phase === 'default' && (
        <Html position={TAP_LOCAL_OFFSET} center zIndexRange={[5, 0]}>
          <button
            type="button"
            className="start-tap"
            aria-label="tap to open"
            onClick={onTapStart}
          >
            tap to open
          </button>
        </Html>
      )}
    </group>
  )
}

export default Toybox
