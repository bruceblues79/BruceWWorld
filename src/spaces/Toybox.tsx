import { useEffect } from 'react'
import { Html, useGLTF } from '@react-three/drei'
import type * as THREE from 'three'

const MODEL_URL = '/assets/glb/toybox.glb'
const MODEL_POSITION: [number, number, number] = [0, 1.3, -1.5]
const TAP_POSITION: [number, number, number] = [0, 1.4, -1.45]

function Toybox() {
  const { scene } = useGLTF(MODEL_URL)

  // toybox.glb 的单材质依赖顶点色 COLOR_0 着色，不能整块替换材质，
  // 只对既有材质实例覆写 PBR 参数：标准不透明、金属度 0、粗糙度 0.5。
  useEffect(() => {
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      for (const material of materials) {
        const pbr = material as THREE.MeshStandardMaterial
        pbr.metalness = 0
        pbr.roughness = 0.5
        pbr.transparent = false
      }
    })
  }, [scene])

  return (
    <group>
      <primitive object={scene} position={MODEL_POSITION} />
      <Html position={TAP_POSITION} center zIndexRange={[5, 0]}>
        <button type="button" className="start-tap" aria-label="tap here">
          tap here
        </button>
      </Html>
    </group>
  )
}

export default Toybox
