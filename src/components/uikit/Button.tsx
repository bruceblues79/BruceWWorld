import { Button as DefaultButton } from '@react-three/uikit-default'

// 项目 uikit 入口层（src/components/uikit/）。
//
// 为什么不直接 import '@react-three/uikit-default/button'：
// - 中央化本项目对官方 kit Button 的调用点（variant/size/主题后续都在这里统一）
// - 后须添加 Card / Slider / Switch 等 kit 组件时，与本项目内其他 UI 设置保持同构
// - tre-shaking 不受影响：只 re-export，类型不变
//
// 例：<UiKitButton variant="outline" size="lg" onClick={open}>点击打开</UiKitButton>
export const UiKitButton = DefaultButton
export type { ButtonProperties } from '@react-three/uikit-default'
export { Button as UiKitButtonVanilla } from '@pmndrs/uikit-default'
