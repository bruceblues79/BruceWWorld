import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import Toybox, { type Phase } from './Toybox'
import './StartSpace.css'

const CAMERA_POSITION: [number, number, number] = [0, 1.6, 0]
const LOOK_AT: [number, number, number] = [0, 0.6, -2]

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

// 初始视距与初始俯仰角，由相机/目标位置推导，避免手写误差
const VIEW_DISTANCE = Math.hypot(
  CAMERA_POSITION[0] - LOOK_AT[0],
  CAMERA_POSITION[1] - LOOK_AT[1],
  CAMERA_POSITION[2] - LOOK_AT[2],
)
const POLAR_INITIAL = Math.acos(
  (CAMERA_POSITION[1] - LOOK_AT[1]) / VIEW_DISTANCE,
)
// 交互约束：左右 ±45°；俯仰以当前视角为中心 ±10°；缩放视距 ±0.5；禁 pan
const AZIMUTH_TILT = Math.PI / 4
const POLAR_TILT = (10 * Math.PI) / 180
const DISTANCE_TOLERANCE = 0.5

const MOBILE_UA =
  /Android|webOS|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i

function isMobileDevice() {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const fine = window.matchMedia('(hover: hover)').matches
  return MOBILE_UA.test(navigator.userAgent) || (coarse && !fine)
}

/**
 * 横屏体验：跟踪朝向 + 全屏状态，提供"点击进入全屏"处理器。
 *
 * 行为契约：
 * - 竖屏点 → 先尝试 screen.orientation.lock('landscape')（Android Chrome PWA tab 才能成功，
 *   普通 tab/iOS Safari 会 reject，静默），再 requestFullscreen
 * - 横屏点 → requestFullscreen；点完进入全屏，按钮自动隐藏
 * - 任何时刻若处于全屏 + 朝向变 portrait → 自动 document.exitFullscreen()，
 *   按钮重新出现
 *
 * Web 平台限制：
 * - 无强制全屏 API（必须用户手势）；iOS Safari 仅 <video> 支持全屏，documentElement
 *   requestFullscreen 会 reject，本 hook 用 .catch(()=>{}) 静默降级
 * - 自动旋转屏 orientation.lock 只对安装好的 PWA 真正生效；普通 tab 多数会 reject
 */
function useLandscapeExperience() {
  // 朝向：portrait=true 表示当前是竖屏
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
  const isLandscape = isMobile && !portrait

  /**
   * 离开全屏。当用户从横屏全屏转回竖屏时调用，避免视觉上方向错乱。
   * 仅当确实处于全屏态才调，否则 exitFullscreen 在某些环境会 reject。
   */
  const exitFullscreenSafely = () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    }
  }

  // 自动退出逻辑：处于全屏 + 朝向变 portrait → 退出
  // 用 effect 响应 state 变化，不在事件回调里直接 setState
  useEffect(() => {
    if (isFullscreen && isMobile && portrait) exitFullscreenSafely()
  }, [isFullscreen, isMobile, portrait])

  /**
   * 点击进入全屏。可在任意朝向调用；竖屏时会先尝试锁向横屏（多数设备会 reject，无副作用）。
   * 全屏请求必须在用户手势回调里发起，hook 已保证调用方是 onClick。
   */
  const requestFullscreen = () => {
    if (!isMobile) return
    // 尝试锁向横屏；非 PWA / iOS 会 reject，静默
    const orient = (screen as Screen & { orientation?: ScreenOrientation }).orientation
    if (orient && typeof orient.lock === 'function') {
      orient.lock('landscape').catch(() => {})
    }
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  return { isMobile, isLandscape, isFullscreen, requestFullscreen }
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
  const { isMobile, isFullscreen, requestFullscreen } = useLandscapeExperience()
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
        camera={{
          position: CAMERA_POSITION,
          fov: 50,
          near: 0.1,
          far: 100,
        }}
      >
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
            onTapStart={() => setPhase('opening')}
            onOpened={() => setPhase('opened')}
          />
          <Environment files="/assets/hdr/starter_space.hdr" />
        </Suspense>
        <OrbitControls
          makeDefault
          target={LOOK_AT}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minAzimuthAngle={-AZIMUTH_TILT}
          maxAzimuthAngle={AZIMUTH_TILT}
          minPolarAngle={POLAR_INITIAL - POLAR_TILT}
          maxPolarAngle={POLAR_INITIAL + POLAR_TILT}
          minDistance={VIEW_DISTANCE - DISTANCE_TOLERANCE}
          maxDistance={VIEW_DISTANCE + DISTANCE_TOLERANCE}
        />
      </Canvas>
      <LoadingOverlay />
      {isMobile && !isFullscreen && (
        <div className="start-rotate-hint" role="note" onClick={requestFullscreen}>
          点击进入全屏体验
        </div>
      )}
    </>
  )
}

export default StartSpace
