/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, PCFSoftShadowMap } from '@iwsdk/core';

/**
 * 渲染器阴影开关（单一职责）。
 * IWSDK 创建 WebGLRenderer 时不开启 shadowMap（three 默认关闭），
 * 场景灯光的 castShadow 与网格标记需要此开关才会真正产出阴影。
 * init 在首帧前执行，直接设置渲染管线状态即可。
 */
export class ShadowSupportSystem extends createSystem({}) {
  init(): void {
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
  }
}
