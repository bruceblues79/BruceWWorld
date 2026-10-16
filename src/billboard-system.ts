/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createSystem, Vector3 } from '@iwsdk/core';
import { Billboard } from './components.js';

/**
 * 只旋转不位移的 billboard：把实体的 +Z 面转向观察者，绝不改变位置。
 *
 * UIKitML 面板是单面且朝 +Z，因此对准相机的偏航角即 `atan2(dx, dz)`，无 180° 修正项。
 * 不用 IWSDK 内置 Follower：它是"跟随头部"的面板组件，会把面板位置一起拖向玩家，
 * 而祭坛按钮必须留在原位、只转动朝向。
 *
 * 优先级高于本项目的相机系统，使面板跟随本帧最新的视点。
 */
export class BillboardSystem extends createSystem({
  billboards: { required: [Billboard] },
}) {
  private readonly viewer = new Vector3();
  private readonly anchor = new Vector3();

  update(): void {
    this.world.camera.getWorldPosition(this.viewer);
    for (const entity of this.queries.billboards.entities) {
      const object = entity.object3D;
      if (!object) continue;
      object.getWorldPosition(this.anchor);
      if (entity.getValue(Billboard, 'lockY')) {
        object.rotation.set(
          0,
          Math.atan2(this.viewer.x - this.anchor.x, this.viewer.z - this.anchor.z),
          0,
        );
      } else {
        object.lookAt(this.viewer);
      }
    }
  }
}
