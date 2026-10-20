/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { RayDisplayMode, type RayPointer, World, AssetManager } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AltarScreenSystem } from './altar-screen-system.js';
import { BillboardSystem } from './billboard-system.js';
import { StartCameraSystem } from './start-camera.js';
import { ToyboxSystem } from './toybox-system.js';
import { installXRButton } from './xr-button.js';
import './index.css';

// 版本可观测：强刷后打开控制台即可确认线上版本
console.info(`BruceWWorld v${__APP_VERSION__}`);

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // XR 远射线：手在追踪中即恒显（IWSDK 默认 VisibleOnIntersection，仅命中
  // 可交互物才渐显）。RayPointer 在私有字段后无公开开关，用窄结构断言访问；
  // 追踪丢失/近场指针接管仍会隐藏。与 HarborDefender 同款。
  for (const hand of ['left', 'right'] as const) {
    const rayVisual = (
      world.input.xr.multiPointers[hand] as unknown as {
        ray: { visual: RayPointer };
      }
    ).ray.visual;
    rayVisual.rayDisplayMode = RayDisplayMode.Visible;
  }

  world.registerSystem(StartCameraSystem);
  world.registerSystem(ToyboxSystem);
  world.registerSystem(AltarScreenSystem);
  // UI 层：排在相机系统之后，使 billboard 使用本帧视点
  world.registerSystem(BillboardSystem, { priority: 30 });
  installXRButton(world);

  // 资产加载完成后移除初始加载层
  document.getElementById('initial-loading')?.remove();
}).catch((err) => {
  const loading = document.getElementById('initial-loading');
  if (loading) {
    loading.textContent = `加载失败: ${err.message}`;
    loading.style.color = '#ff6b6b';
  }
  console.error('World 初始化失败:', err);
});
