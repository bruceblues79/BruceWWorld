import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Vector3Tuple } from 'three'

const PANEL_MODEL_URL = '/assets/glb/panel_comm.glb'

export type PanelCommProps = {
  position?: Vector3Tuple
  scale?: number
  scaleX?: number
  scaleY?: number
  /** 边框件颜色（中心板不受影响），默认白色 */
  tint?: string
}

// 九宫格布局规则：
// - 横向边件 top/bottom：随 scaleX 缩放 x 轴（拉伸），y 位置随 scaleY 平移
// - 纵向边件 left/right：随 scaleY 缩放 y 轴（拉伸），x 位置随 scaleX 平移
// - 四角 corner_*：永不缩放，位置按初始值 × scaleX/scaleY 平移
// - 中心板 plane：两轴直接缩放（scaleX, scaleY, 1）
const H_EDGES = ['top', 'bottom']
const V_EDGES = ['left', 'right']
const CORNERS = ['corner_t_l', 'corner_t_r', 'corner_b_l', 'corner_b_r']

export default function PanelComm({
  position = [0, 0, 0],
  scale = 1,
  scaleX = 1,
  scaleY = 1,
  tint = '#ffffff',
}: PanelCommProps) {
  const { scene } = useGLTF(PANEL_MODEL_URL)

  // useGLTF 返回的是缓存共享的同一场景实例；本组件必然多实例（多个按钮面板），
  // 必须深拷贝出自己的层级，否则布局变换/材质会跨实例互相污染。
  // 几何体与源材质仍与缓存共享（clone 不复制），内存无额外负担。
  const root = useMemo(() => scene.clone(true), [scene])

  // 各节点 Blender 初始位置，首次挂载时缓存；布局始终从初始值比例推导，可幂等重算
  const initPositions = useRef<Map<string, THREE.Vector3>>(new Map())
  const frameMat = useRef<THREE.MeshBasicMaterial | null>(null)
  const panelMat = useRef<THREE.MeshPhongMaterial | null>(null)

  // 一次性：缓存初始位置 + 替换材质（plane → 半透明 Phong，其余 → 无光 Basic）
  useEffect(() => {
    initPositions.current.clear()
    for (const name of [...H_EDGES, ...V_EDGES, ...CORNERS, 'plane']) {
      const node = root.getObjectByName(name)
      if (node) initPositions.current.set(name, node.position.clone())
    }

    panelMat.current = new THREE.MeshPhongMaterial({
      transparent: true,
      opacity: 0.2,
      shininess: 64,
      side: THREE.DoubleSide,
    })
    frameMat.current = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      side: THREE.DoubleSide,
    })

    const plane = root.getObjectByName('plane')
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.material = object === plane ? panelMat.current : frameMat.current
    })

    return () => {
      panelMat.current?.dispose()
      frameMat.current?.dispose()
    }
  }, [root])

  // tint 只改边框件颜色
  useEffect(() => {
    frameMat.current?.color.set(tint)
  }, [tint, root])

  // 布局更新：从缓存的初始位置按比例推导，scaleX/scaleY 变化即重算
  useEffect(() => {
    for (const name of [...H_EDGES, ...V_EDGES, ...CORNERS]) {
      const node = root.getObjectByName(name)
      const init = initPositions.current.get(name)
      if (!node || !init) continue
      if (name === 'top' || name === 'bottom') {
        node.scale.x = scaleX
        node.position.y = init.y * scaleY
      } else if (name === 'left' || name === 'right') {
        node.scale.y = scaleY
        node.position.x = init.x * scaleX
      } else {
        node.position.x = init.x * scaleX
        node.position.y = init.y * scaleY
      }
    }
    const plane = root.getObjectByName('plane')
    if (plane) plane.scale.set(scaleX, scaleY, 1)
  }, [root, scaleX, scaleY])

  return (
    <group position={position} scale={scale}>
      <primitive object={root} />
    </group>
  )
}
