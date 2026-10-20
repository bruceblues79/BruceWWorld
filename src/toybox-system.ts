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
  Types,
  loadUIKitMLAsset,
} from '@iwsdk/core';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  ToyboxPhase,
  ToyboxTag,
  AltarButton,
  Billboard,
} from './components.js';
import type { AltarKindValue } from './components.js';

/** Toybox 世界锚点（原 main 分支 MODEL_POSITION，整体 +Z 0.4 与相机/灯光同步） */
const MODEL_POSITION: [number, number, number] = [0, 0.3, -1.6];
/** TAP 按钮在 toybox 局部坐标中的偏移 */
const TAP_LOCAL_OFFSET: [number, number, number] = [0, 0.3, 0.65];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 开盒三段共用的缓动：power2.inOut */
const easeInOut = (p: number): number =>
  p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

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

export class ToyboxSystem extends createSystem(
  {
    toybox: { required: [ToyboxTag, ToyboxPhase] },
    tapButton: { required: [RayInteractable, Pressed] },
  },
  {
    // 整体缩放（含 TAP/祭坛子面板，随根变换继承）
    rootScale: {
      type: Types.Float32,
      default: 0.7,
      step: 0.05,
      min: 0.05,
      label: 'Root Scale',
    },
    // 开盒动画参数：相对初始姿态快照的增量与时长，update 内标量积分，编辑器可调
    hingeSpin: {
      type: Types.Float32,
      default: -Math.PI,
      step: 0.05,
      label: 'Hinge Spin (rad)',
    },
    rootShiftX: {
      type: Types.Float32,
      default: -0.6,
      step: 0.05,
      label: 'Root Shift X',
    },
    rotateTurn: {
      type: Types.Float32,
      default: -Math.PI / 2,
      step: 0.05,
      label: 'Rotate Turn (rad)',
    },
    hingeDuration: {
      type: Types.Float32,
      default: 1,
      step: 0.1,
      min: 0.05,
      label: 'Hinge Duration (s)',
    },
    shiftDuration: {
      type: Types.Float32,
      default: 0.6,
      step: 0.1,
      min: 0.05,
      label: 'Shift Duration (s)',
    },
    rotateDuration: {
      type: Types.Float32,
      default: 1,
      step: 0.1,
      min: 0.05,
      label: 'Rotate Duration (s)',
    },
    pauseSeconds: {
      type: Types.Float32,
      default: 0.3,
      step: 0.1,
      min: 0,
      label: 'Pause Between Steps (s)',
    },
  },
) {
  private toyboxEntity: Entity | null = null;
  private toyboxObject: Object3D | null = null;
  private tapButtonEntity: Entity | null = null;
  private hdrTexture: Texture | null = null;
  /** 开盒时间轴的节点与初始姿态快照（Blender 导出姿态），update 内纯标量积分 */
  private hingeNode: Object3D | null = null;
  private rotateNode: Object3D | null = null;
  private hingeStartZ = 0;
  private rotateStartY = 0;
  private rootStartX = 0;

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
    this.hingeNode = scene.getObjectByName('root_hinge') ?? null;
    this.rotateNode = scene.getObjectByName('root_rotate') ?? null;
    this.hingeStartZ = this.hingeNode?.rotation.z ?? 0;
    this.rotateStartY = this.rotateNode?.rotation.y ?? 0;
    this.toyboxEntity = this.world.createTransformEntity(scene, {
      persistent: true,
    });
    this.toyboxEntity.addComponent(ToyboxTag);
    this.toyboxEntity.addComponent(ToyboxPhase);

    const transform = this.toyboxEntity.object3D;
    if (transform) {
      transform.position.set(...MODEL_POSITION);
      transform.scale.setScalar(this.config.rootScale.peek());
      this.rootStartX = transform.position.x;
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

  /** 开盒命令：只写状态（thin command），时间轴推进全部在 update 派生 */
  private startOpening(): void {
    const entity = this.toyboxEntity;
    if (!entity) return;

    entity.setValue(ToyboxPhase, 'phase', 'opening');
    entity.setValue(ToyboxPhase, 't', 0);

    if (this.tapButtonEntity?.object3D) {
      this.tapButtonEntity.object3D.visible = false;
    }
  }

  /** opening 阶段累计 t 并由 t 推导三段变换，到点写 opened 并创建祭坛按钮 */
  private advanceOpening(delta: number): void {
    const entity = this.toyboxEntity;
    if (!entity || entity.getValue(ToyboxPhase, 'phase') !== 'opening') return;

    const cfg = this.config;
    const total =
      cfg.hingeDuration.peek() +
      cfg.shiftDuration.peek() +
      cfg.rotateDuration.peek() +
      cfg.pauseSeconds.peek() * 2;
    const t = Math.min((entity.getValue(ToyboxPhase, 't') ?? 0) + delta, total);

    this.applyOpeningProgress(t);

    if (t >= total) {
      entity.setValue(ToyboxPhase, 'phase', 'opened');
      void this.createAltarButtons();
    } else {
      entity.setValue(ToyboxPhase, 't', t);
    }
  }

  /** 由 t 绝对推导三段变换（初始姿态快照 + 增量 × 缓动），零分配 */
  private applyOpeningProgress(t: number): void {
    const cfg = this.config;
    const pause = cfg.pauseSeconds.peek();
    const hingeDur = cfg.hingeDuration.peek();
    const shiftDur = cfg.shiftDuration.peek();

    if (this.hingeNode) {
      const p1 = clamp01(t / hingeDur);
      this.hingeNode.rotation.z =
        this.hingeStartZ + cfg.hingeSpin.peek() * easeInOut(p1);
    }

    if (this.toyboxObject) {
      const p2 = clamp01((t - hingeDur - pause) / shiftDur);
      // 位移是世界空间量，按 rootScale 等比缩小，保证缩放后开盒仍相对居中
      this.toyboxObject.position.x =
        this.rootStartX +
        cfg.rootShiftX.peek() * cfg.rootScale.peek() * easeInOut(p2);
    }

    if (this.rotateNode) {
      const p3 = clamp01((t - hingeDur - pause - shiftDur - pause) / cfg.rotateDuration.peek());
      this.rotateNode.rotation.y =
        this.rotateStartY + cfg.rotateTurn.peek() * easeInOut(p3);
    }
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

      // 弹出积分与可点时机（pop≥1 加 RayInteractable）统一由 AltarScreenSystem 驱动
    }
  }

  private tapButtonTriggered = false;

  update(delta: number): void {
    if (!this.tapButtonTriggered && this.tapButtonEntity?.hasComponent(Pressed)) {
      this.tapButtonTriggered = true;
      this.startOpening();
    }
    this.advanceOpening(delta);
  }
}
