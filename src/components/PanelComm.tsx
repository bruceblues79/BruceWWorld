import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Vector3Tuple } from 'three'

const PANEL_MODEL_URL = '/assets/glb/panel_comm.glb'
// panel_comm.glb 基准尺寸按 1×1 计（不按 glb 实测外沿，调用方直接给目标尺寸）
const BASE_SIZE = 1

export type PanelCommProps = {
  position?: Vector3Tuple
  scale?: number
  /** 面板目标外沿宽（世界单位，随组 scale 再放大） */
  scaleX?: number
  /** 面板目标外沿高（世界单位，随组 scale 再放大） */
  scaleY?: number
  /** 边框件颜色（中心板不受影响），默认白色 */
  tint?: string
}

// 九宫格布局规则（输入为目标尺寸，内部换算成对基准的比例）：
// - 横向边件 top/bottom：x 长度随目标宽拉伸，y 位置随目标高平移
// - 纵向边件 left/right：y 长度随目标高拉伸，x 位置随目标宽平移
// - 四角 corner_*：永不缩放，位置按初始位置 × 比例平移
// - 中心板 plane：两轴直接缩放
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
  // 初始位置必须在 clone 时一并捕获：effect 里缓存会在 StrictMode 卸载重挂时
  // 于布局改写 node.position 之后重跑，把污染值当初始值（面板会塌向中心）。
  // useMemo 每次执行都从未被改动的缓存场景重新 clone，天然幂等。
  const { root, inits: initPositions } = useMemo(() => {
    const clone = scene.clone(true)
    const inits = new Map<string, THREE.Vector3>()
    for (const name of [...H_EDGES, ...V_EDGES, ...CORNERS, 'plane']) {
      const node = clone.getObjectByName(name)
      if (node) inits.set(name, node.position.clone())
    }
    return { root: clone, inits }
  }, [scene])

  const frameMat = useRef<THREE.MeshBasicMaterial | null>(null)
  const panelMat = useRef<THREE.MeshLambertMaterial | null>(null)

  // 一次性：替换材质（plane → 半透明 Lambert 淡底、无反光；其余 → 无光 Basic 白）
  useEffect(() => {
    panelMat.current = new THREE.MeshLambertMaterial({
      transparent: true,
      opacity: 0.25,
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

  // 布局更新：目标尺寸换算成对基准的比例，从初始位置按比例推导
  useEffect(() => {
    const rx = scaleX / BASE_SIZE
    const ry = scaleY / BASE_SIZE
    for (const name of [...H_EDGES, ...V_EDGES, ...CORNERS]) {
      const node = root.getObjectByName(name)
      const init = initPositions.get(name)
      if (!node || !init) continue
      if (name === 'top' || name === 'bottom') {
        node.scale.x = rx
        node.position.y = init.y * ry
      } else if (name === 'left' || name === 'right') {
        node.scale.y = ry
        node.position.x = init.x * rx
      } else {
        node.position.x = init.x * rx
        node.position.y = init.y * ry
      }
    }
    const plane = root.getObjectByName('plane')
    if (plane) plane.scale.set(rx, ry, 1)
  }, [root, initPositions, scaleX, scaleY])

  return (
    <group position={position} scale={scale}>
      <primitive object={root} />
    </group>
  )
}
