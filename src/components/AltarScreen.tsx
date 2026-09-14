import { Suspense, useEffect, useRef, useState } from 'react'
import { useLoader } from '@react-three/fiber'
import { Image } from '@react-three/uikit'
import { Card, CardContent, CardFooter, Button } from '@react-three/uikit-default'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import type { Vector3Tuple } from 'three'
import XRTechScreen from './screens/XRTechScreen'
import AboutMeScreen from './screens/AboutMeScreen'
import LiteGameScreen, { GAMES } from './screens/LiteGameScreen'

// AltarScreen：祭坛场景的悬浮内容面板，固定挂载在 starter canvas 世界坐标
// [0, 1, -1.75]，介于相机与 toybox 之间。外层 drei Billboard 始终朝向相机，
// 保证 OrbitControls 环绕时面板始终可见可读。
//
// 路由：根据 altarName（box / heart / person）从三张 banner 纹理中取对应一张，
// 显示在信息区顶部作为 title 条（banner 比例 8:1，显示尺寸 600×75px 不变形）。
// box → banner_xr → XRTechScreen、heart → banner_game → LiteGameScreen、
// person → banner_me → AboutMeScreen。
//
// 显隐：组件初始挂载且默认不可见（scale 0），由父组件通过 altarName prop 控制。
// altarName 非 null 时显示（true→false 即时归零；false→true 时 gsap scale
// 0.8→1，0.3s easeOut）。遵循 project_memory：UI 组件初始挂载 + scale 控制，
// 不走条件渲染。
//
// 布局：纵向分 5，上 4/5 为信息区，下 1/5 为操作行。信息区内部分两段：
// 顶部 banner 条（600×75px，保持 8:1 比例不变形）+ 剩余内容区。
// 内容区外包一层 Card（borderRadius=0 直角边框、borderWidth=2、半透明白底）
// 作为「不带圆角的线」提供划分感，内部按路由渲染对应子屏组件：
//   - XRTechScreen（xr 作品，空占位）
//   - LiteGameScreen（轻游戏选择列表，3 行/页，点选高亮+确定跳转）
//   - AboutMeScreen（简历，空占位）
// 操作行内含 4 个横向排列的正方按钮（无文字 + 图标）：
// 上一页 / 下一页 / 确定 / 返回。「确定」在 game 路由下打开选中游戏的 url；
// 「返回」调用 onClose 关闭面板并重新显示 AltarButton（无动画）。
//
// 用 uikit-default 的 Card（继承 Container 并通过 defaultOverrides 预设
// 背景色/边框/圆角/flexDirection 主题默认值，减少易遗漏的属性）。
// 注意：Container / Card / Button / CardFooter 在源码层面同源同校验（均
// hasNonUikitChildren: false），但本版本（@react-three/uikit@1.0.76）实测
// 裸 Container 在 3D 世界坐标场景无法渲染 panel mesh（不可见）：
//   - 2026-09-13 A/B 对照：同位置同属性 Card 红块可见、Container 不可见
//   - Card 通过 uikit-default 的 build(VanillaCard, "VanillaDefaultCard") 包装
//     路径触发 panel mesh 正确创建，裸 Container 的 build(VanillaContainer)
//     在 3D 世界坐标场景 panel mesh 不可见
//   - 另：Container 嵌套 Container + gsap scale 在 isRenderless Container 上的
//     组合会导致整棵 Canvas 子树崩溃（曾导致「场景全没、DOM 还在」故障）
// 源码静态分析 ≠ 运行时行为——经验结论优先，3D 世界坐标场景的面板与子分区
// 一律走 Card / CardContent / CardFooter 路径。同样地，直接塞 R3F group/mesh
// 或 drei Billboard 进 UIKit 容器会抛 "Only pmndrs/uikit components can be
// added as children..." 异常，导致 Canvas 子树崩溃——普通 Three.js 节点须
// 放在 UIKit 根节点外层（本组件即
// <group><Billboard><Card>...</Card></Billboard></group>）。
//
// 尺寸换算：1px = 0.001 世界单位（与 AltarButton/ToyboxTapButton 一致），0.6m → 600px。
// 透明度走 rgba 字符串（与现有 Button 一致；本版本 uikit 无独立 backgroundOpacity prop）。

const PANEL_WIDTH = 0.6 / 0.001
const PANEL_HEIGHT = 0.8 / 0.001
const PIXEL_SIZE = 0.001
// 操作行高度 = 1/5 面板高；操作按钮正方，略小于行高留间距
const OP_ROW_HEIGHT = PANEL_HEIGHT / 5
const OP_BUTTON_SIZE = OP_ROW_HEIGHT - 20
// banner 条高度：保持 512×64 源图 8:1 比例不变形，宽 = 面板宽 600px
const BANNER_HEIGHT = PANEL_WIDTH / 8
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

// 路由表：altarName → banner 纹理 URL
// box → banner_xr、heart → banner_game、person → banner_me
const BANNER_BY_ALTAR = {
  box: '/assets/textures/banner_xr.png',
  heart: '/assets/textures/banner_game.png',
  person: '/assets/textures/banner_me.png',
} as const

// 模块加载时即预热四张操作按钮 PNG + 三张 banner 纹理（与 Toybox 的
// altar PNG 预热同模式）：StartSpace 一旦 import 本模块，请求即开始，
// 与 GLB/HDR/altar 纹理并行；组件内 useLoader 命中缓存直接返回纹理，
// 不挂起 Suspense
for (const url of OP_BUTTON_TEXTURES) {
  useLoader.preload(THREE.TextureLoader, url)
}
for (const url of Object.values(BANNER_BY_ALTAR)) {
  useLoader.preload(THREE.TextureLoader, url)
}

export type AltarName = 'box' | 'heart' | 'person'

export type AltarScreenProps = {
  position?: Vector3Tuple
  /** 当前路由的 altar；非 null 时显示面板，null 时隐藏 */
  altarName: AltarName | null
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
  altarName,
  onClose,
}: AltarScreenProps) {
  // altarName 非 null 即可见，沿用原有显隐动画逻辑
  const visible = altarName !== null

  // game 路由下的选中游戏 id（供「确定」按钮读取并跳转）。
  // 关闭面板时（handleClose）重置，避免重开后残留旧选中态。
  const [selectedGame, setSelectedGame] = useState<string | null>(null)

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
  // 三张 banner 纹理同样走 R3F 缓存（已模块级 preload 预热），按 altarName 路由
  const texBannerXr = useLoader(THREE.TextureLoader, BANNER_BY_ALTAR.box)
  const texBannerGame = useLoader(THREE.TextureLoader, BANNER_BY_ALTAR.heart)
  const texBannerMe = useLoader(THREE.TextureLoader, BANNER_BY_ALTAR.person)
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
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texBannerXr.colorSpace = THREE.SRGBColorSpace
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texBannerXr.matrixAutoUpdate = false
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texBannerGame.colorSpace = THREE.SRGBColorSpace
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texBannerGame.matrixAutoUpdate = false
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texBannerMe.colorSpace = THREE.SRGBColorSpace
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texBannerMe.matrixAutoUpdate = false
  const textures = [texPrev, texNext, texConform, texBack]
  // 按 altarName 路由到对应 banner 纹理；altarName 为 null 时不渲染 Image
  const bannerTexture =
    altarName === 'box'
      ? texBannerXr
      : altarName === 'heart'
        ? texBannerGame
        : altarName === 'person'
          ? texBannerMe
          : null

  // 操作行按钮回调（顺序：上一页 / 下一页 / 确定 / 返回）。
  // 「确定」仅在 game 路由且有选中游戏时生效：打开该游戏的 url（外链或 WebGL 页）。
  // 无 url 则 no-op；XR/Me 路由下确定也 no-op（空占位无子屏交互）。
  // 「返回」先重置选中态再调用 onClose，避免重开面板时残留旧选中。
  const handleConfirm = () => {
    if (altarName !== 'heart' || !selectedGame) return
    const game = GAMES.find((g) => g.id === selectedGame)
    if (game?.url) {
      window.open(game.url, '_blank')
    }
  }
  const handleClose = () => {
    setSelectedGame(null)
    onClose()
  }
  const handlers = [
    () => {}, // 上一页：暂未实装（GAMES ≤ 3 无需分页）
    () => {}, // 下一页：暂未实装
    handleConfirm,
    handleClose, // 返回
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
            {/* 信息区（上 4/5）。CardContent 自带 flexDirection=column 主题默认值，
                内部纵向分两段：顶部 banner 条（600×75px 保持 8:1 不变形）+
                内容区框架。banner 仅在 visible 时渲染——altarName 为 null 时
                bannerTexture 为 null，uikit Image 拿到 null texture 会报错；
                同时面板整体 scale=0 不可见，省略 banner 无视觉影响。 */}
            <CardContent
              height={PANEL_HEIGHT - OP_ROW_HEIGHT}
              paddingTop={0}
              paddingBottom={0}
              paddingLeft={0}
              paddingRight={0}
              flexDirection="column"
            >
              {visible && bannerTexture && (
                <Image
                  src={bannerTexture}
                  width="100%"
                  height={BANNER_HEIGHT}
                  objectFit="cover"
                />
              )}
              {/* 内容区框架：Card 默认 borderRadius.lg，这里覆盖为 0 得到直角边框，
                  作为「不带圆角的线」划分 banner 与内容区、内容区与操作行。
                  flexGrow=1 填满 banner 之外的信息区高度（≈565px）。 */}
              {visible && (
                <Card
                  flexGrow={1}
                  borderRadius={0}
                  borderWidth={2}
                  borderColor="#ffffff"
                  backgroundColor="rgba(255, 255, 255, 0.08)"
                  padding={16}
                  flexDirection="column"
                >
                  {altarName === 'box' && <XRTechScreen />}
                  {altarName === 'heart' && (
                    <LiteGameScreen
                      selected={selectedGame}
                      onSelect={setSelectedGame}
                    />
                  )}
                  {altarName === 'person' && <AboutMeScreen />}
                </Card>
              )}
            </CardContent>
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
