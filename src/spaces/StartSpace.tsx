import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useProgress } from '@react-three/drei'
import Toybox from './Toybox'
import './StartSpace.css'

const CAMERA_POSITION: [number, number, number] = [0, 1.6, 0]
const LOOK_AT: [number, number, number] = [0, 1.3, -1.5]
const BACKGROUND_COLOR = '#f2ddbb'

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

/** 移动端竖屏时提示横屏；横屏或桌面端不提示 */
function useShowRotateHint(): boolean {
  const [portrait, setPortrait] = useState(
    () => window.matchMedia('(orientation: portrait)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)')
    const update = () => setPortrait(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isMobileDevice() && portrait
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
  const showRotateHint = useShowRotateHint()

  return (
    <div className="start-space">
      <Canvas
        dpr={[1, 2]}
        camera={{
          position: CAMERA_POSITION,
          fov: 50,
          near: 0.1,
          far: 100,
        }}
      >
        <color attach="background" args={[BACKGROUND_COLOR]} />
        <ambientLight intensity={0.35} color="#fff2e0" />
        <directionalLight position={[3, 5, 2]} intensity={2.2} color="#fff1df" />
        <Suspense fallback={null}>
          <Toybox />
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
      {showRotateHint && (
        <div className="start-rotate-hint" role="note">
          请横屏浏览，获得最佳体验
        </div>
      )}
    </div>
  )
}

export default StartSpace
