import { PerspectiveCamera, OrbitControls } from '@react-three/drei'

// starter 场景的相机 + OrbitControls：
// - PerspectiveCamera makeDefault 接管默认相机，直接 ref 拿实例，为后续 gsap 动画预留
// - OrbitControls makeDefault 限制俯仰 ±10°、缩放 ±0.5，禁 pan（方位不限）
// - 几何约束常量从 CAMERA_POSITION/LOOK_AT 推导，模块级求值一次
// - mount 顺序：PerspectiveCamera 必须先于 OrbitControls，否则 controls 拿到的
//   state.camera 是 Canvas 默认相机而非 PerspectiveCamera（drei makeDefault 栈语义）

const CAMERA_POSITION: [number, number, number] = [0, 1.65, 0]
const LOOK_AT: [number, number, number] = [0, 0.6, -2]

// 初始视距与初始俯仰角，由相机/目标位置推导，避免手写误差
const VIEW_DISTANCE = Math.hypot(
  CAMERA_POSITION[0] - LOOK_AT[0],
  CAMERA_POSITION[1] - LOOK_AT[1],
  CAMERA_POSITION[2] - LOOK_AT[2],
)
const POLAR_INITIAL = Math.acos(
  (CAMERA_POSITION[1] - LOOK_AT[1]) / VIEW_DISTANCE,
)
// 交互约束：俯仰以当前视角为中心 ±10°；缩放视距 ±0.5；禁 pan（方位不限）
const POLAR_TILT = (10 * Math.PI) / 180
const DISTANCE_TOLERANCE = 0.5

function StarterSpaceCamera() {
  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={CAMERA_POSITION}
        fov={50}
        near={0.1}
        far={100}
      />
      <OrbitControls
        makeDefault
        target={LOOK_AT}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={POLAR_INITIAL - POLAR_TILT}
        maxPolarAngle={POLAR_INITIAL + POLAR_TILT}
        minDistance={VIEW_DISTANCE - DISTANCE_TOLERANCE}
        maxDistance={VIEW_DISTANCE + DISTANCE_TOLERANCE}
      />
    </>
  )
}

export default StarterSpaceCamera
