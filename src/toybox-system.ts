/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  createSystem,
  AssetManager,
  RayInteractable,
  Pressed,
  Entity,
  Object3D,
  Mesh,
  ShaderMaterial,
  DoubleSide,
  Color,
  Vector3,
  Texture,
  loadUIKitMLAsset,
} from '@iwsdk/core';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';
import {
  ToyboxPhase,
  ToyboxTag,
  AltarButton,
  Billboard,
} from './components.js';
import type { AltarKindValue } from './components.js';

/** Toybox 世界锚点（原 main 分支 MODEL_POSITION） */
const MODEL_POSITION: [number, number, number] = [0, 0.3, -2];
/** TAP 按钮在 toybox 局部坐标中的偏移 */
const TAP_LOCAL_OFFSET: [number, number, number] = [0, 0.3, 0.65];

/** 开盒动画参数（增量驱动，节点自带 Blender 初始姿态） */
const HINGE_SPIN = -Math.PI;
const ROOT_SHIFT_X = -0.6;
const ROTATE_TURN = -Math.PI / 2;
const PAUSE_SECONDS = 0.3;
const EASE = 'power2.inOut';

/** 水面节点名称 */
const WATER_NODE_NAMES = ['water_l', 'water_r'] as const;

/** 祭坛节点与对应 SVG 贴图资产 ID */
const ALTAR_NODES = [
  { name: 'altar_heart', imageAssetId: 'altar-heart', altar: 'heart' },
  { name: 'altar_person', imageAssetId: 'altar-person', altar: 'person' },
  { name: 'altar_box', imageAssetId: 'altar-box', altar: 'box' },
] as const;

const waterVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vWorldViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const waterFragmentShader = /* glsl */ `
  uniform sampler2D uEnvMap;
  uniform vec3 uDebugTint;
  varying vec3 vWorldNormal;
  varying vec3 vWorldViewDir;
  void main() {
    vec3 normal = normalize(vWorldNormal);
    if (!gl_FrontFacing) normal = -normal;
    vec3 viewDir = normalize(vWorldViewDir);
    vec3 reflectDir = reflect(-viewDir, normal);
    float u = atan(reflectDir.z, reflectDir.x) / (2.0 * 3.141592653589793) + 0.5;
    float v = asin(clamp(reflectDir.y, -1.0, 1.0)) / 3.141592653589793 + 0.5;
    vec4 color = texture2D(uEnvMap, vec2(u, v));
    color.rgb *= uDebugTint;
    gl_FragColor = color;
    #include <colorspace_fragment>
  }
`;

export class ToyboxSystem extends createSystem({
  toybox: { required: [ToyboxTag, ToyboxPhase] },
  tapButton: { required: [RayInteractable, Pressed] },
}) {
  private toyboxEntity: Entity | null = null;
  private toyboxObject: Object3D | null = null;
  private tapButtonEntity: Entity | null = null;
  private gsapTimeline: gsap.core.Timeline | null = null;
  private hdrTexture: Texture | null = null;

  init(): void {
    void this.bootstrap().catch((err) => {
      console.error('ToyboxSystem 初始化失败:', err);
    });
  }

  private async bootstrap(): Promise<void> {
    // 1. 预加载 HDR 纹理（用于水面假反射）
    this.hdrTexture = await AssetManager.loadHDRTextureById('starter-space.hdr');

    // 2. 加载 toybox GLB
    const gltf = await AssetManager.loadGLTFById('toybox');
    this.setupToybox(gltf);

    // 3. 创建 TAP 按钮
    const tapPanel = await loadUIKitMLAsset('tap-button');
    this.createTapButton(tapPanel);

    // 4. 预加载祭坛 SVG 纹理（避免开盒后延迟）
    await Promise.all(
      ALTAR_NODES.map((n) => AssetManager.loadTextureById(n.imageAssetId)),
    );
  }

  private setupToybox(gltf: GLTF): void {
    const scene = gltf.scene;

    scene.traverse((object: Object3D) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    for (const name of WATER_NODE_NAMES) {
      const object = scene.getObjectByName(name);
      if (object instanceof Mesh) {
        object.material = this.createWaterMaterial();
      }
    }

    this.toyboxObject = scene;
    this.toyboxEntity = this.world.createTransformEntity(scene, {
      persistent: true,
    });
    this.toyboxEntity.addComponent(ToyboxTag);
    this.toyboxEntity.addComponent(ToyboxPhase);

    const transform = this.toyboxEntity.object3D;
    if (transform) {
      transform.position.set(...MODEL_POSITION);
      transform.scale.setScalar(1);
    }
  }

  private createWaterMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        uEnvMap: { value: this.hdrTexture },
        uDebugTint: { value: new Color(1, 1, 1) },
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      side: DoubleSide,
      toneMapped: false,
    });
  }

  /** UI 不参与阴影投射/接收，避免面板在模型上投假影 */
  private disablePanelShadows(panel: Object3D): void {
    panel.traverse((object: Object3D) => {
      if (object instanceof Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
  }

  private createTapButton(panel: Object3D): void {
    this.disablePanelShadows(panel);
    this.tapButtonEntity = this.world.createTransformEntity(panel, {
      persistent: true,
    });
    this.tapButtonEntity.addComponent(RayInteractable);

    if (this.tapButtonEntity.object3D && this.toyboxObject) {
      const localPos = new Vector3(...TAP_LOCAL_OFFSET);
      this.tapButtonEntity.object3D.position.copy(localPos);
      this.toyboxObject.add(this.tapButtonEntity.object3D);
    }
  }

  private startOpeningAnimation(): void {
    if (!this.toyboxEntity) return;

    this.toyboxEntity.setValue(ToyboxPhase, 'phase', 'opening');

    if (this.tapButtonEntity?.object3D) {
      this.tapButtonEntity.object3D.visible = false;
    }

    const hinge = this.toyboxObject?.getObjectByName('root_hinge');
    const rotate = this.toyboxObject?.getObjectByName('root_rotate');
    if (!hinge || !rotate || !this.toyboxObject) return;

    this.gsapTimeline = gsap.timeline({
      onComplete: () => {
        this.toyboxEntity?.setValue(ToyboxPhase, 'phase', 'opened');
        this.createAltarButtons();
      },
    });

    this.gsapTimeline
      .to(hinge.rotation, { z: `+=${HINGE_SPIN}`, duration: 1, ease: EASE })
      .to(
        this.toyboxObject.position,
        { x: `+=${ROOT_SHIFT_X}`, duration: 0.6, ease: EASE },
        `+=${PAUSE_SECONDS}`,
      )
      .to(
        rotate.rotation,
        { y: `+=${ROTATE_TURN}`, duration: 1, ease: EASE },
        `+=${PAUSE_SECONDS}`,
      );
  }

  private async createAltarButtons(): Promise<void> {
    if (!this.toyboxObject || !this.toyboxEntity) return;

    const worldPos = new Vector3();
    const localPos = new Vector3();

    for (const { name, imageAssetId, altar } of ALTAR_NODES) {
      const node = this.toyboxObject.getObjectByName(name);
      if (!node) continue;

      node.updateWorldMatrix(true, false);
      node.getWorldPosition(worldPos);
      localPos.copy(worldPos);
      this.toyboxObject.worldToLocal(localPos);

      await this.createAltarButton(imageAssetId, altar, localPos);
    }
  }

  private async createAltarButton(
    imageAssetId: string,
    altar: AltarKindValue,
    localPosition: Vector3,
  ): Promise<void> {
    const panel = await loadUIKitMLAsset('altar-button');
    const texture = await AssetManager.loadTextureById(imageAssetId);

    this.disablePanelShadows(panel);

    const image = panel.getElementById('AltarImage');
    if (image && texture) {
      image.setProperties({ src: texture });
    }

    const entity = this.world.createTransformEntity(panel, {
      persistent: true,
    });
    entity.addComponent(AltarButton, { altar });

    if (entity.object3D && this.toyboxObject) {
      entity.object3D.position.copy(localPosition);
      this.toyboxObject.add(entity.object3D);
      entity.object3D.scale.setScalar(0);

      // Billboard：只旋转不位移，面板 +Z 面始终朝向观察者（固定在祭坛原位）。
      // lockY: false 让俯仰也一起对准，面板上下左右都正对玩家
      entity.addComponent(Billboard, { lockY: false });

      gsap.to(entity.object3D.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 0.5,
        ease: 'power1.in',
        onComplete: () => {
          entity.addComponent(RayInteractable);
        },
      });
    }
  }

  private tapButtonTriggered = false;

  update(): void {
    if (!this.tapButtonTriggered && this.tapButtonEntity?.hasComponent(Pressed)) {
      this.tapButtonTriggered = true;
      this.startOpeningAnimation();
    }
  }

  destroy(): void {
    if (this.gsapTimeline) {
      this.gsapTimeline.kill();
    }
  }
}
