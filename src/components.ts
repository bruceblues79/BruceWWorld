/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { defineComponents, createComponent, Types } from '@iwsdk/core';

/** 开盒阶段：default（待开）→ opening（动画中）→ opened（完成） */
const Phase = {
  Default: 'default',
  Opening: 'opening',
  Opened: 'opened',
} as const;

export const ToyboxPhase = createComponent('ToyboxPhase', {
  phase: {
    type: Types.Enum,
    default: Phase.Default,
    enum: Phase,
    label: 'Phase',
  },
});

/** 显式标签：标记 toybox 实体 */
export const ToyboxTag = createComponent('ToyboxTag', {});

/** 祭坛路由：none（面板关闭）/ box / heart / person（当前打开的祭坛页） */
export const AltarRoute = {
  None: 'none',
  Box: 'box',
  Heart: 'heart',
  Person: 'person',
} as const;

/** 祭坛按钮自身的祭坛类型（不含 none，按钮必然属于某个祭坛） */
export const AltarKind = {
  Box: 'box',
  Heart: 'heart',
  Person: 'person',
} as const;

export type AltarRouteValue = (typeof AltarRoute)[keyof typeof AltarRoute];
export type AltarKindValue = (typeof AltarKind)[keyof typeof AltarKind];

/**
 * 祭坛面板：route 是"当前打开哪个祭坛页"的唯一真值。
 * 面板显隐动画、页眉文字、三个祭坛按钮的隐藏/重显全部由它派生。
 */
export const AltarScreen = createComponent('AltarScreen', {
  route: {
    type: Types.Enum,
    default: AltarRoute.None,
    enum: AltarRoute,
    label: 'Route',
  },
});

/** 显式标签 + 数据：标记祭坛按钮实体，并记录它打开哪一个祭坛页 */
export const AltarButton = createComponent('AltarButton', {
  altar: {
    type: Types.Enum,
    default: AltarKind.Box,
    enum: AltarKind,
    label: 'Altar',
  },
});

/** 只旋转不位移的 billboard：+Z 面朝向观察者 */
export const Billboard = createComponent('Billboard', {
  /** true 仅绕 Y 轴偏航（面板保持竖直）；false 连俯仰一起转向观察者 */
  lockY: { type: Types.Boolean, default: true },
});

export default defineComponents([
  ToyboxPhase,
  ToyboxTag,
  AltarScreen,
  AltarButton,
  Billboard,
]);
