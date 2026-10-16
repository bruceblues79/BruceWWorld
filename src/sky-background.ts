/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  createSystem,
} from '@iwsdk/core';

/** 天空垂直渐变色标，与原主页 StartSpace 天空纹理及 body CSS 渐变同源（单真值见 iwsdk-port-notes §2.5） */
const SKY_STOPS: ReadonlyArray<readonly [offset: number, color: string]> = [
  [0.0, '#3a5f7e'], // 顶部 — 深天蓝
  [0.25, '#7798b8'], // 上 — 浅天蓝
  [0.45, '#a3b8c5'], // 地平线上 — 灰蓝
  [0.55, '#a8b9b9'], // 地平线 — 灰青过渡
  [0.7, '#5a87a4'], // 海面浅蓝
  [1.0, '#1f4769'], // 底部 — 深海水
];

/**
 * 把程序化垂直渐变挂到 scene.background，复刻原主页天空。
 * IWSDK 的 AR 环境控制器在进入 passthrough 时会自动快照并隐藏背景、
 * 会话结束后恢复，无需在此处理 XR 切换。
 */
export class SkyBackgroundSystem extends createSystem({}) {
  init(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    for (const [offset, color] of SKY_STOPS) {
      grad.addColorStop(offset, color);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;

    // 与场景同生命周期，不存在卸载路径，不 dispose
    this.scene.background = texture;
  }
}
