import { Suspense, useEffect, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { Image } from '@react-three/uikit'
import { Card, CardContent, CardFooter, Button } from '@react-three/uikit-default'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import type { Vector3Tuple } from 'three'

// AltarScreen：祭坛场景的悬浮内容面板，固定挂载在 starter canvas 世界坐标
// [0, 1, -1.75]，介于相机与 toybox 之间。外层 drei Billboard 始终朝向相机，
// 保证 OrbitControls 环绕时面板始终可见可读。
//
// 显隐：组件初始挂载且默认不可见（scale 0），由父组件通过 visible prop 控制。
// visible true→false 时即时归零（无动画）；false→true 时 gsap scale 0.8→1，
// 0.3s easeOut。遵循 project_memory：UI 组件初始挂载 + scale 控制，不走条件渲染。
//
// 布局：纵向分 5，上 4/5 为信息区（暂空，后续填内容），下 1/5 为操作行，
// 内含 4 个横向排列的正方按钮（无文字 + 图标）：上一页 / 下一页 / 确定 / 返回。
// 当前仅「返回」实装：调用 onClose 关闭面板并重新显示 AltarButton（无动画）。
//
// 用 uikit-default 的 Card（继承 Container 并通过 defaultOverrides 预设
// 背景色/边框/圆角/flexDirection 主题默认值，减少易遗漏的属性）。
// 注意：Container / Card / Button / CardFooter 同源同校验——均 hasNonUikitChildren: false，
// 直接塞 R3F group/mesh 或 drei Billboard 会抛 "Only pmndrs/uikit components can be
// added as children..." 异常，导致 Canvas 子树崩溃（Canvas 外 DOM sibling 仍可见，
// 即"场景全没、标题/备案号还在"现象）。普通 Three.js 节点须放在 UIKit 根节点外层
// （本组件即 <group><Billboard><Card>...</Card></Billboard></group>）。
// 因此默认面板优先用 Card 当底，子分区用 CardContent / CardFooter——它们同属
// uikit-default，与 Card 同套 build() 包装路径；并不是因为裸 Container 不能渲染。
// Fullscreen 仅用于屏幕空间 HUD（挂相机、按 FOV 自动算 pixelSize），非本组件前提。
//
// 尺寸换算：1px = 0.001 世界单位（与 AltarButton/ToyboxTapButton 一致），0.6m → 600px。
// 透明度走 rgba 字符串（与现有 Button 一致；本版本 uikit 无独立 backgroundOpacity prop）。

const PANEL_WIDTH = 0.6 / 0.001
const PANEL_HEIGHT = 0.8 / 0.001
const PIXEL_SIZE = 0.001
// 操作行高度 = 1/5 面板高；操作按钮正方，略小于行高留间距
const OP_ROW_HEIGHT = PANEL_HEIGHT / 5
const OP_BUTTON_SIZE = OP_ROW_HEIGHT - 20
// 按压缩放（与 AltarButton 一致：直 ref 操作，无过渡）
const PRESS_SCALE = 0.95
// 弹出动画参数
const POP_FROM = 0.8
const POP_DURATION = 0.3
const POP_EASE = 'power2.out'

// 底部操作按钮图标与回调配置（顺序：上一页 / 下一页 / 确定 / 返回）
const OP_BUTTON_TEXTURES = [
  '/assets/textures/btn_prev.png',
  '/assets/textures/btn_next.png',
  '/assets/textures/btn_conform.png',
  '/assets/textures/btn_back.png',
] as const

// 模块加载时即预热四张操作按钮 PNG 纹理（与 Toybox 的 altar PNG 预热同模式）：
// StartSpace 一旦 import 本模块，请求即开始，与 GLB/HDR/altar 纹理并行；
// 操作按钮内 useLoader 命中缓存直接返回纹理，不挂起 Suspense
for (const url of OP_BUTTON_TEXTURES) {
  useLoader.preload(THREE.TextureLoader, url)
}

export type AltarScreenProps = {
  position?: Vector3Tuple
  visible: boolean
  onClose: () => void
}

// AltarScreen 底部操作按钮子组件：
// - 按压反馈走 uikit 内置 active conditional + transformScale（0.95），
//   不直接操作 Object3D.scale——uikit panel mesh 的 matrixWorld 会被内部
//   自动更新覆盖，手动 scale 无效；transformScale 走 uikit 内部 transform
//   管道，会正确应用到 panel mesh
// - 去掉 cursor="pointer"：cursor 非空会触发 addHoverHandlers 注册 hover
//   handlers，hover 时 ghost variant 的 hover.backgroundColor=colors.accent
//   (hsl(0,0,96.1) 接近白色) 会被应用，移动端/点击后 hover 状态可能保持
//   导致白色高亮不消失；去掉 cursor 后 hover handlers 不注册，hover 条件
//   永远为 false，不触发 hover 样式
// - pointerDownOnButton ref + pointerup 自触发 onClick：移动端长按后浏览器
//   不合成 click 事件，与 AltarButton 同模式
// - 不带弹出动画：AltarScreen 弹出时整组按钮一起出现
// - Image 走 80% 宽高 + Button 居中布局，留出图标周围 padding
function OpButton({
  texture,
  onClick,
}: {
  texture: THREE.Texture
  onClick: () => void
}) {
  const pointerDownOnButton = useRef(false)

  const handlePointerDown = () => {
    pointerDownOnButton.current = true
  }
  const handlePointerUp = () => {
    if (!pointerDownOnButton.current) return
    pointerDownOnButton.current = false
    onClick()
  }
  const handlePointerCancel = () => {
    pointerDownOnButton.current = false
  }

  return (
    <Button
      variant="ghost"
      width={OP_BUTTON_SIZE}
      height={OP_BUTTON_SIZE}
      pixelSize={PIXEL_SIZE}
      borderRadius={16}
      borderColor="#ffffff"
      borderWidth={2}
      backgroundColor="rgba(255, 255, 255, 0.2)"
      depthWrite={false}
      renderOrder={11}
      paddingTop={0}
      paddingBottom={0}
      paddingLeft={0}
      paddingRight={0}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      active={{
        transformScaleX: PRESS_SCALE,
        transformScaleY: PRESS_SCALE,
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerCancel}
      onPointerCancel={handlePointerCancel}
    >
      <Image
        src={texture}
        width="80%"
        height="80%"
        objectFit="cover"
      />
    </Button>
  )
}

function AltarScreenInner({
  position,
  visible,
  onClose,
}: AltarScreenProps) {
  // 外层 group 承载显隐 scale 动画（Billboard 只负责旋转，不缩放）
  const scaleRef = useRef<THREE.Group>(null)

  // 显隐动画：visible true→false 即时归零；false→true gsap 0.8→1 0.3s easeOut
  useEffect(() => {
    const g = scaleRef.current
    if (!g) return
    if (visible) {
      g.scale.setScalar(POP_FROM)
      const tween = gsap.to(g.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: POP_DURATION,
        ease: POP_EASE,
      })
      return () => {
        tween.kill()
      }
    }
    g.scale.setScalar(0)
  }, [visible])

  // 四张操作按钮纹理走 R3F 缓存（已模块级 preload 预热）。
  // useLoader 是 hook，不能放在 .map 回调里；按固定顺序各调一次。
  const texPrev = useLoader(THREE.TextureLoader, OP_BUTTON_TEXTURES[0])
  const texNext = useLoader(THREE.TextureLoader, OP_BUTTON_TEXTURES[1])
  const texConform = useLoader(THREE.TextureLoader, OP_BUTTON_TEXTURES[2])
  const texBack = useLoader(THREE.TextureLoader, OP_BUTTON_TEXTURES[3])
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texPrev.colorSpace = THREE.SRGBColorSpace
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texPrev.matrixAutoUpdate = false
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texNext.colorSpace = THREE.SRGBColorSpace
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texNext.matrixAutoUpdate = false
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texConform.colorSpace = THREE.SRGBColorSpace
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texConform.matrixAutoUpdate = false
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texBack.colorSpace = THREE.SRGBColorSpace
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texBack.matrixAutoUpdate = false
  const textures = [texPrev, texNext, texConform, texBack]

  // 只有「返回」（最后一项）实装 onClose，其余暂为空函数待后续实装
  const handlers = [
    () => {},
    () => {},
    () => {},
    onClose,
  ] as const

  return (
    <group position={position}>
      <group ref={scaleRef} scale={0}>
        <Billboard>
          <Card
            width={PANEL_WIDTH}
            height={PANEL_HEIGHT}
            pixelSize={PIXEL_SIZE}
            borderRadius={24}
            borderColor="#ffffff"
            borderWidth={4}
            backgroundColor="rgba(255, 255, 255, 0.25)"
            depthWrite={false}
            renderOrder={10}
            flexDirection="column"
            paddingTop={0}
            paddingBottom={0}
            paddingLeft={0}
            paddingRight={0}
          >
            {/* 信息区（上 4/5，暂空，后续填内容）。
                用 CardContent（uikit-default，与 Card 同套 build() 路径，
                自带 flexDirection=column 主题默认值，减少易遗漏的属性） */}
            <CardContent
              height={PANEL_HEIGHT - OP_ROW_HEIGHT}
              paddingTop={0}
              paddingBottom={0}
              paddingLeft={0}
              paddingRight={0}
            />
            {/* 操作行（下 1/5，四个横向正方按钮）。同样用 CardFooter。
                OpButton 走 conditional render：visible=false 时卸载释放 uikit
                内部 activeSignal（按下 back 关闭面板后 pointerLeave 不触发，
                activeSignal 残留 pointerId 导致下次打开时 active=true 白色高亮
                保留）；visible=true 时重挂载，状态重置。纹理已模块级 preload
                命中缓存，重挂载不挂起 Suspense。 */}
            <CardFooter
              height={OP_ROW_HEIGHT}
              flexDirection="row"
              justifyContent="space-around"
              alignItems="center"
              paddingTop={0}
              paddingBottom={0}
              paddingLeft={0}
              paddingRight={0}
            >
              {visible && textures.map((tex, i) => (
                <OpButton
                  key={i}
                  texture={tex}
                  onClick={handlers[i]}
                />
              ))}
            </CardFooter>
          </Card>
        </Billboard>
      </group>
    </group>
  )
}

export default function AltarScreen(props: AltarScreenProps) {
  // 操作按钮纹理虽已模块级 preload，但首次渲染前缓存可能尚未就绪；
  // 包 Suspense 兜底，就绪后整块出现，不影响外层 AltarScreen 挂载时机
  return (
    <Suspense fallback={null}>
      <AltarScreenInner {...props} />
    </Suspense>
  )
}
