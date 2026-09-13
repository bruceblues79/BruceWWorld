import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import ToyboxTapButton from './ToyboxTapButton'
import AltarButton from './AltarButton'
import type { Vector3Tuple } from 'three'

const MODEL_URL = '/assets/glb/toybox.glb'
// 整个 toybox + tap 按钮的「世界锚点」
const MODEL_POSITION: [number, number, number] = [0, 0.3, -2]
// tap 面板在 toybox 局部坐标中的偏移，与模型保持相对位置（相机旋转时随之一起运动）。
// z=0.65：盒体前缘在局部 z≈0.55（世界 -1.45），面板厚 0.03，再留 ~0.1 悬浮间隙防穿模
const TAP_LOCAL_OFFSET: [number, number, number] = [0, 0.3, 0.65]

// 开盒动画：三段均以「增量」驱动 —— 节点自带 Blender 初始姿态（root_hinge 已绕 z 180°、
// root_rotate 已绕 y 90°），绝对目标会让后两段失去动作。
// 旋转方向：初始实现与预期相反，用户 2026-09-08 确认两处旋转都取负向。
const HINGE_SPIN = -Math.PI // root_hinge 再绕局部 z 转 -180°
const ROOT_SHIFT_X = -0.6 // root（glb 场景根）沿局部 x 平移
const ROTATE_TURN = -Math.PI / 2 // root_rotate 再绕局部 y 转 -90°
const PAUSE_SECONDS = 0.3 // 段间停顿
const EASE = 'power2.inOut'

// 开盒后挂载次级按钮的三个祭坛节点（与 public/assets/textures 下 PNG 一一对应）
const ALTAR_NODES = [
  { name: 'altar_heart', image: '/assets/textures/altar_heart.png' },
  { name: 'altar_person', image: '/assets/textures/altar_person.png' },
  { name: 'altar_box', image: '/assets/textures/altar_box.png' },
] as const

export type Phase = 'default' | 'opening' | 'opened'

interface ToyboxProps {
  phase: Phase
  /** 当前是否竖屏（来自 matchMedia 朝向）：竖屏整体缩放到 0.75，横屏为 1 */
  portrait: boolean
  onTapStart: () => void
  onOpened: () => void
}

function Toybox({ phase, portrait, onTapStart, onOpened }: ToyboxProps) {
  const { scene } = useGLTF(MODEL_URL)

  // 整体缩放：竖屏 0.75 / 横屏 1，外层 group 以此为锚点缩放（含 tap 按钮）
  const groupRef = useRef<THREE.Group>(null!)
  const targetScale = portrait ? 0.75 : 1

  // 开盒动画完成后，三个祭坛节点在 toybox group 局部坐标中的位置（用于挂按钮）
  const [altarPositions, setAltarPositions] = useState<Record<string, Vector3Tuple>>({})

  // 挂载时直接落到目标 scale，避免加载瞬间出现 1→0.75 的缩放动画
  useLayoutEffect(() => {
    if (groupRef.current) groupRef.current.scale.setScalar(targetScale)
  }, [])

  // 朝向变化时从当前 scale 平滑逼近目标（帧率无关 lerp，~0.5s 收敛）
  useFrame((_, delta) => {
    const g = groupRef.current
    if (!g) return
    const t = 1 - Math.exp(-delta * 6)
    const next = g.scale.x + (targetScale - g.scale.x) * t
    g.scale.setScalar(next)
  })

  // 开启模型阴影：给所有 mesh 打 cast/receive 标（只动 per-mesh 标志，不改材质参数）
  useEffect(() => {
    scene.traverse((object) => {
      if (object.type === 'Mesh') {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
  }, [scene])

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

  // 开盒动画完成（phase==='opened'）后，取三个祭坛节点的世界坐标并换算为
  // toybox group 局部坐标，供 AltarButton 挂载。节点缺失则跳过该项。
  useEffect(() => {
    if (phase !== 'opened') return
    const group = groupRef.current
    if (!group) return
    const positions: Record<string, Vector3Tuple> = {}
    const world = new THREE.Vector3()
    for (const { name } of ALTAR_NODES) {
      const node = scene.getObjectByName(name)
      if (!node) continue
      node.updateWorldMatrix(true, false)
      node.getWorldPosition(world)
      const local = group.worldToLocal(world.clone())
      positions[name] = [local.x, local.y, local.z]
    }
    setAltarPositions(positions)
  }, [phase, scene])

  return (
    // model 与 tap 面板同处一个 group：面板用局部偏移挂在此 group 下，
    // 转动视角时面板始终保持与 toybox 的相对空间位置（真 3D，非 billboard）
    <group ref={groupRef} position={MODEL_POSITION}>
      <primitive object={scene} />
      {phase === 'default' && (
        <ToyboxTapButton
          position={TAP_LOCAL_OFFSET}
          label="点击打开"
          onClick={onTapStart}
        />
      )}
      {phase === 'opened' &&
        ALTAR_NODES.map(({ name, image }) => {
          const pos = altarPositions[name]
          if (!pos) return null
          return (
            <AltarButton
              key={name}
              position={pos}
              imageSrc={image}
              // 本次无后续闭环，点击不触发任何逻辑
              onClick={() => {}}
            />
          )
        })}
    </group>
  )
}

export default Toybox
