/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  toybox: {
    url: publicAssetUrl('gltf/toybox.glb'),
    type: AssetType.GLTF,
    name: 'Toybox',
    priority: 'critical',
  },
  // Key must end with ".hdr": IWSDK's EnvironmentSystem sniffs the file type
  // from the raw src suffix BEFORE resolving manifest keys, so a key without
  // the extension would be loaded as a plain (non-decodable) texture.
  'starter-space.hdr': {
    url: publicAssetUrl('textures/starter_space.hdr'),
    type: AssetType.HDRTexture,
    name: 'Starter Space HDR',
    priority: 'critical',
  },
  'altar-heart': {
    url: publicAssetUrl('textures/altar_heart.svg'),
    type: AssetType.Texture,
    name: 'Altar Heart',
    priority: 'background',
  },
  'altar-person': {
    url: publicAssetUrl('textures/altar_person.svg'),
    type: AssetType.Texture,
    name: 'Altar Person',
    priority: 'background',
  },
  'altar-box': {
    url: publicAssetUrl('textures/altar_box.svg'),
    type: AssetType.Texture,
    name: 'Altar Box',
    priority: 'background',
  },
  'tap-button': {
    url: publicAssetUrl('ui/tap-button.uikitml'),
    type: AssetType.UIKitML,
    name: 'Tap Button UI',
    priority: 'critical',
  },
  'altar-button': {
    url: publicAssetUrl('ui/altar-button.uikitml'),
    type: AssetType.UIKitML,
    name: 'Altar Button UI',
    priority: 'background',
  },
  // 祭坛面板的四个操作按钮图标（上一页/下一页/确定/返回）。
  // 面板 uikitml 内只写占位相对路径，运行时按元素 id 覆盖为这些已注册纹理，
  // 与 altar-button 的图标注入方式一致。
  'btn-prev': {
    url: publicAssetUrl('textures/btn_prev.svg'),
    type: AssetType.Texture,
    name: 'Op Prev',
    priority: 'background',
  },
  'btn-next': {
    url: publicAssetUrl('textures/btn_next.svg'),
    type: AssetType.Texture,
    name: 'Op Next',
    priority: 'background',
  },
  'btn-conform': {
    url: publicAssetUrl('textures/btn_conform.svg'),
    type: AssetType.Texture,
    name: 'Op Confirm',
    priority: 'background',
  },
  'btn-back': {
    url: publicAssetUrl('textures/btn_back.svg'),
    type: AssetType.Texture,
    name: 'Op Close',
    priority: 'background',
  },
  'altar-screen': {
    url: publicAssetUrl('ui/altar-screen.uikitml'),
    type: AssetType.UIKitML,
    name: 'Altar Screen UI',
    priority: 'background',
  },
});
