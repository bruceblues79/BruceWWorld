import { Html, useGLTF } from '@react-three/drei'

const MODEL_URL = '/assets/glb/toybox.glb'
// 整个 toybox + tap 按钮的「世界锚点」
const MODEL_POSITION: [number, number, number] = [0, 0.3, -2]
// tap 按钮在 toybox 局部坐标中的偏移，与模型保持相对位置（相机旋转时随之一起运动）
const TAP_LOCAL_OFFSET: [number, number, number] = [0, 0.15, 0.25]

function Toybox() {
  const { scene } = useGLTF(MODEL_URL)

  return (
    // model 与 tap 同处一个 group：tap 用局部偏移挂在此 group 下，
    // 转动视角时 tap 始终保持与 toybox 的相对空间位置。
    <group position={MODEL_POSITION}>
      <primitive object={scene} />
      <Html position={TAP_LOCAL_OFFSET} center zIndexRange={[5, 0]}>
        <button type="button" className="start-tap" aria-label="tap here">
          tap here
        </button>
      </Html>
    </group>
  )
}

export default Toybox
