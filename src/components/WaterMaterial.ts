// toybox 湖水节点（water_l / water_r）的动态假反射材质：
// - 用视线方向与法线计算反射向量，反射向量映射到 equirectangular HDR 采样，
//   随观察角度变化而变化（假反射：只反射环境贴图，不反射场景物体，非真实 PBR）
// - unlit：自定义 ShaderMaterial 不做任何光照计算
// - tonemapping off：不包含 tonemapping_fragment chunk，仅做线性→输出颜色空间转换
// - water_l / water_r 各自独立实例化材质（同 shader、同 HDR 纹理），排查共用材质导致的问题
import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import * as THREE from 'three'

const HDR_URL = '/assets/hdr/starter_space.hdr'

// 模块加载时即预热 HDR 纹理（进入 R3F useLoader 缓存），与 GLB/Environment 并发，
// 同时避免与 drei <Environment> 对同一 URL 的请求竞态导致 ERR_ABORTED
useLoader.preload(HDRLoader, HDR_URL)

const vertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vWorldViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uEnvMap;
  uniform vec3 uDebugTint;
  varying vec3 vWorldNormal;
  varying vec3 vWorldViewDir;
  void main() {
    vec3 normal = normalize(vWorldNormal);
    // DoubleSide 下背面翻转法线，保证正反面都能正确反射
    if (!gl_FrontFacing) normal = -normal;
    vec3 viewDir = normalize(vWorldViewDir);
    vec3 reflectDir = reflect(-viewDir, normal);
    // 反射向量（笛卡尔）→ equirectangular UV
    float u = atan(reflectDir.z, reflectDir.x) / (2.0 * 3.141592653589793) + 0.5;
    float v = asin(clamp(reflectDir.y, -1.0, 1.0)) / 3.141592653589793 + 0.5;
    vec4 color = texture2D(uEnvMap, vec2(u, v));
    color.rgb *= uDebugTint;
    gl_FragColor = color;
    // colorspace_pars_fragment 由 WebGLProgram 自动注入，这里只需 colorspace_fragment
    // 做线性→输出颜色空间转换（非 tonemapping）
    #include <colorspace_fragment>
  }
`

/** 工厂函数：创建一个水面 shader 材质实例 */
function createWaterMaterial(hdr: THREE.Texture, tint = new THREE.Color(1, 1, 1)): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uEnvMap: { value: hdr },
      uDebugTint: { value: tint },
    },
    vertexShader,
    fragmentShader,
    // water_l 挂在 root_hinge 下，其 180° Z 旋转把平面法线翻向下方；
    // 用 DoubleSide 避免背面剔除导致水面不可见
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}

/** 加载 HDR 并返回水面材质工厂（每次调用 create 都生成独立实例） */
export function useWaterMaterialFactory() {
  const hdr = useLoader(HDRLoader, HDR_URL)
  return useMemo(
    () => ({
      create: (tint?: THREE.Color) => createWaterMaterial(hdr, tint),
    }),
    [hdr],
  )
}
