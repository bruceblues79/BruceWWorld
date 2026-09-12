import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import Toybox, { type Phase } from '../components/Toybox'
import StarterSpaceCamera from '../components/StarterSpaceCamera'
import './StartSpace.css'

/** 程序化生成竖直渐变天空纹理：顶冷蓝 → 地平线暖 → 底暖沙 */
function useSkyTexture(): THREE.Texture {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 1024
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
    grad.addColorStop(0.0, '#3a5f7e') // 顶部 — 深天蓝
    grad.addColorStop(0.25, '#7798b8') // 上 — 浅天蓝
    grad.addColorStop(0.45, '#a3b8c5') // 地平线上 — 灰蓝
    grad.addColorStop(0.55, '#a8b9b9') // 地平线 — 灰青过渡
    grad.addColorStop(0.7, '#5a87a4') // 海面浅蓝
    grad.addColorStop(1.0, '#1f4769') // 底部 — 深海水
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return tex
  }, [])
}

/** 把天空纹理挂到 scene.background，卸载时释放 */
function SceneBackground() {
  const sky = useSkyTexture()
  useEffect(() => () => sky.dispose(), [sky])
  return <primitive attach="background" object={sky} />
}

const MOBILE_UA =
  /Android|webOS|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i

function isMobileDevice() {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const fine = window.matchMedia('(hover: hover)').matches
  return MOBILE_UA.test(navigator.userAgent) || (coarse && !fine)
}

/**
 * 朝向 + 全屏跟踪：提供"点击进入全屏"处理器。
 *
 * 行为契约：
 * - 任意朝向点击 → requestFullscreen；不再尝试锁向横屏（移除 screen.orientation.lock）
 * - 全屏后按钮自动隐藏；朝向变化不自动退出全屏，由用户自行旋转
 *
 * Web 平台限制：
 * - 无强制全屏 API（必须用户手势）；iOS Safari 仅 <video> 支持全屏，documentElement
 *   requestFullscreen 会 reject，本 hook 用 .catch(()=>{}) 静默降级
 */
function useLandscapeExperience() {
  // 朝向：portrait=true 表示当前是竖屏（供 toybox 横竖屏缩放使用）
  const [portrait, setPortrait] = useState(
    () => window.matchMedia('(orientation: portrait)').matches,
  )
  // 全屏：isFullscreen=true 表示 document 处于全屏状态（按 fullscreenchange 跟踪）
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && !!document.fullscreenElement,
  )

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)')
    const onOrient = () => setPortrait(mq.matches)
    mq.addEventListener('change', onOrient)
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      mq.removeEventListener('change', onOrient)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [])

  const isMobile = isMobileDevice()

  /**
   * 点击进入全屏。仅进入全屏态，不锁向横屏。
   */
  const requestFullscreen = () => {
    if (!isMobile) return
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  return { isMobile, isFullscreen, portrait, requestFullscreen }
}

function LoadingOverlay() {
  const { active } = useProgress()
  if (!active) return null
  return (
    <div className="start-loading" role="status" aria-live="polite">
      <span className="start-loading-spinner" aria-hidden="true" />
      <p>loading</p>
    </div>
  )
}

function StartSpace() {
  const { isMobile, isFullscreen, portrait, requestFullscreen } = useLandscapeExperience()
  // starter 场景阶段：default（待开）→ opening（开盒动画中）→ opened（闭环完成）
  const [phase, setPhase] = useState<Phase>('default')

  // 把方向光的 shadow 投影焦点拉到 toybox 中心 —— 默认 target=(0,0,0) 会让 frustum
  // 对偏在 z=-2 的模型取样失真、阴影看上去"飘"到远处。
  const lightRef = useRef<THREE.DirectionalLight>(null!)
  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    light.target.position.set(0, 0.3, -2)
    light.target.updateMatrixWorld()
    // DirectionalLight.target 默认不在 scene 中，必须手动加入才能参与变换
    light.parent?.add(light.target)
  }, [])

  // Canvas 与 DOM overlays 平行组织：3D 内容不包在任何 DOM 容器里，
  // overlays 用 fixed 相对视口定位，将来引入 XR 不受 DOM 结构影响
  return (
    <>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
      >
        <StarterSpaceCamera />
        <SceneBackground />
        <directionalLight
          ref={lightRef}
          position={[2, 6, 3]}
          intensity={1.2}
          color="#fff1df"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-near={0.5}
          shadow-camera-far={20}
          shadow-camera-left={-2.5}
          shadow-camera-right={2.5}
          shadow-camera-top={2.5}
          shadow-camera-bottom={-2.5}
          shadow-bias={-0.0001}
          shadow-normalBias={0.005}
        />
        <Suspense fallback={null}>
          <Toybox
            phase={phase}
            portrait={portrait}
            onTapStart={() => setPhase('opening')}
            onOpened={() => setPhase('opened')}
          />
          <Environment files="/assets/hdr/starter_space.hdr" />
        </Suspense>
      </Canvas>
      <LoadingOverlay />
      {isMobile && !isFullscreen && (
        <div className="start-rotate-hint" role="note" onClick={requestFullscreen}>
          点击进入全屏
        </div>
      )}
    </>
  )
}

export default StartSpace
