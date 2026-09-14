import { useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { Image } from '@react-three/uikit'
import { Card, Button } from '@react-three/uikit-default'
import * as THREE from 'three'

// LiteGameScreen：heart altar → game 路由的内容区子屏。
// 纵向 3 行游戏选择列表（每页容量 3 个，超出后接翻页）。
// 每行 = 一张游戏 banner 图，点击选中（白色高亮边框），再点底部「确定」跳转。
//
// 图片规格：1024×256（4:1）。显示区约 564×141px，objectFit=cover 居中裁切。
// 用户在 public/assets/textures/ 提供 game_<id>.png。
//
// 纹理走 useLoader 缓存：模块级 preload 预热，组件内命中缓存同步取纹理，
// 与 AltarScreen 的 banner/按钮纹理同模式，避免出现后加载中断。

export type GameItem = {
  id: string
  name: string
  image: string
  /** 跳转目标：外链或 WebGL 游戏页。缺省时确定按钮无动作 */
  url?: string
}

// 游戏列表。目前仅 DefendTroy 一项；后续追加即可，超 3 个时接分页。
// oxlint-disable-next-line react/only-export-components -- GAMES 是子屏共享数据，单数组不值得拆文件
export const GAMES: GameItem[] = [
  {
    id: 'defend_troy',
    name: 'DefendTroy',
    image: '/assets/textures/game_def_troy.png',
    url: 'https://svalbardpost.xyz/games/defend-troy/',
  },
]

// 模块加载时即预热所有游戏 banner 纹理（与 Toybox/AltarScreen 同模式）
for (const game of GAMES) {
  useLoader.preload(THREE.TextureLoader, game.image)
}

// 按压反馈缩放（与 AltarButton/OpButton 一致，走 uikit active transformScale）
const PRESS_SCALE = 0.96

export type LiteGameScreenProps = {
  /** 当前选中的 game id；null 表示未选中 */
  selected: string | null
  onSelect: (id: string) => void
}

// 单行游戏选择按钮：
// - 点击（pointerdown→pointerup 同在本按钮）触发 onSelect
// - 选中态：borderWidth 3 + 纯白边框；未选中：borderWidth 1 + 半透明白边框
// - 图片 100% 填充，objectFit=cover 居中裁切
// - 行高按 4:1 比例固定：内容区内宽 564px ÷ 4 = 141px。
//   不用 flexGrow=1（单行会撑满整个内容区），多行时从顶部堆叠、下方留空。
const ROW_HEIGHT = 141
function GameRow({
  game,
  selected,
  onSelect,
}: {
  game: GameItem
  selected: boolean
  onSelect: () => void
}) {
  const texture = useLoader(THREE.TextureLoader, game.image)
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texture.colorSpace = THREE.SRGBColorSpace
  // oxlint-disable-next-line react/immutability -- three Texture 只能原地修改属性
  texture.matrixAutoUpdate = false

  const pointerDownOnButton = useRef(false)
  const handlePointerDown = () => {
    pointerDownOnButton.current = true
  }
  const handlePointerUp = () => {
    if (!pointerDownOnButton.current) return
    pointerDownOnButton.current = false
    onSelect()
  }
  const handlePointerCancel = () => {
    pointerDownOnButton.current = false
  }

  return (
    <Button
      variant="ghost"
      width="100%"
      height={ROW_HEIGHT}
      borderRadius={4}
      borderWidth={selected ? 6 : 1}
      borderColor={selected ? '#ffffff' : 'rgba(255, 255, 255, 0.3)'}
      backgroundColor="rgba(0, 0, 0, 0)"
      paddingTop={0}
      paddingBottom={0}
      paddingLeft={0}
      paddingRight={0}
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
        width="100%"
        height="100%"
        objectFit="cover"
      />
    </Button>
  )
}

export default function LiteGameScreen({ selected, onSelect }: LiteGameScreenProps) {
  return (
    <Card
      flexGrow={1}
      flexDirection="column"
      gap={12}
      borderWidth={0}
      backgroundColor="rgba(0, 0, 0, 0)"
      paddingTop={0}
      paddingBottom={0}
      paddingLeft={0}
      paddingRight={0}
    >
      {GAMES.map((game) => (
        <GameRow
          key={game.id}
          game={game}
          selected={selected === game.id}
          onSelect={() => onSelect(game.id)}
        />
      ))}
    </Card>
  )
}
