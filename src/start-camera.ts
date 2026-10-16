/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { MathUtils, createSystem } from '@iwsdk/core';
// three 在 package.json overrides 中整体别名到 super-three（vite 侧亦有 dedupe），
// addons 与 @iwsdk/core 引用同一实例，不会产生第二份 three
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** 相机注视点（原主页 OrbitControls target，iwsdk-port-notes §2.1） */
const ORBIT_TARGET: [number, number, number] = [0, 0.6, -2];
/**
 * 相机初始局部位置（相对 world.player，非沉浸态 player 位于原点）。
 * 取旧 zoom 最远（maxDistance）端的视点作为新默认：沿原视线方向后移 DISTANCE_LIMIT，
 * 下方 min/maxDistance clamp 公式不变，行程窗口随之整体平移。
 */
const CAMERA_POSITION: [number, number, number] = [0, 1.882, 0.443];
/** 俯仰限制：初始极角 ±10° */
const PITCH_LIMIT_DEG = 10;
/** 视距限制：初始距离 ±0.5 */
const DISTANCE_LIMIT = 0.5;
/** 阻尼 */
const DAMPING_FACTOR = 0.08;

/**
 * 桌面平面模式下的环绕相机，参数照搬原主页 StarterSpaceCamera + OrbitControls。
 * XR 会话期间相机归 IWSDK/XR 运行时所有，此时禁用环绕控制。
 */
export class StartCameraSystem extends createSystem({}) {
  private controls!: OrbitControls;
  private basePolarAngle = 0;
  private baseDistance = 0;

  init(): void {
    this.camera.position.set(...CAMERA_POSITION);
    this.camera.lookAt(...ORBIT_TARGET);

    this.baseDistance = Math.hypot(
      CAMERA_POSITION[0] - ORBIT_TARGET[0],
      CAMERA_POSITION[1] - ORBIT_TARGET[1],
      CAMERA_POSITION[2] - ORBIT_TARGET[2],
    );
    // 极角：目标到相机偏移与 +Y 的夹角
    this.basePolarAngle = Math.acos(
      (CAMERA_POSITION[1] - ORBIT_TARGET[1]) / this.baseDistance,
    );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...ORBIT_TARGET);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = DAMPING_FACTOR;
    this.controls.minDistance = this.baseDistance - DISTANCE_LIMIT;
    this.controls.maxDistance = this.baseDistance + DISTANCE_LIMIT;
    this.controls.minPolarAngle = this.basePolarAngle - MathUtils.degToRad(PITCH_LIMIT_DEG);
    this.controls.maxPolarAngle = this.basePolarAngle + MathUtils.degToRad(PITCH_LIMIT_DEG);
    this.controls.update();
  }

  update(): void {
    if (this.renderer.xr.isPresenting) {
      this.controls.enabled = false;
      return;
    }
    this.controls.enabled = true;
    this.controls.update();
  }
}
