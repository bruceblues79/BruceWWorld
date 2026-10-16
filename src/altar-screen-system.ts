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
  Vector3,
  UIKit,
  loadUIKitMLAsset,
} from '@iwsdk/core';
import gsap from 'gsap';
import {
  AltarScreen,
  AltarButton,
  AltarRoute,
  Billboard,
} from './components.js';
import type { AltarRouteValue } from './components.js';

/**
 * 窗口在被点祭坛按钮上方展开：水平位置取按钮世界坐标，Y 在此基础上上偏。
 * 上偏量 = 面板半高（0.4）+ 与按钮的间隙（0.1），使面板底边落在按钮正上方。
 */
const SCREEN_LIFT_Y = 0.5;

/** 路由 → 面板内页眉元素 id（静态文案，只切 display；空 span 不会被可靠创建） */
const HEADER_ELEMENT_ID: Record<string, string> = {
  box: 'HeaderTech',
  heart: 'HeaderGames',
  person: 'HeaderAbout',
};

/** 四个操作按钮：图标资产 ID 与面板内元素 id，同序（上一页 / 下一页 / 确定 / 返回） */
const OP_BUTTONS = [
  { assetId: 'btn-prev', elementId: 'OpPrev' },
  { assetId: 'btn-next', elementId: 'OpNext' },
  { assetId: 'btn-conform', elementId: 'OpConfirm' },
  { assetId: 'btn-back', elementId: 'OpClose' },
] as const;

/** 面板弹出动画参数（原 main：显示 0.8→1，0.3s；隐藏即时归 0） */
const POP_FROM = 0.8;
const POP_DURATION = 0.3;
const POP_EASE = 'power2.out';

/** 祭坛按钮重显动画参数（原 main AltarButton：0→1，0.5s） */
const BUTTON_POP_DURATION = 0.5;
const BUTTON_POP_EASE = 'power1.in';

/**
 * 祭坛面板系统：拥有面板实体，并驱动"打开/关闭"这一状态机的全部视觉。
 *
 * 单一真值：面板实体上的 `AltarScreen.route`。按钮按下与关闭按钮点击都只做
 * 一件事——写 route（thin command）；面板位置/显隐动画、页眉文字、三个祭坛
 * 按钮的隐藏/重显全部在 update 中由 route 派生（single truth）。
 *
 * 窗口锚点：route 指向哪个祭坛，面板就移动到那个祭坛按钮世界坐标的正上方，
 * 三个祭坛对应各自的展开位置（不再是固定世界坐标）。
 */
export class AltarScreenSystem extends createSystem({
  altarButtons: { required: [AltarButton] },
  pressedAltarButtons: { required: [AltarButton, Pressed] },
}) {
  private screenEntity: Entity | null = null;
  /** 三条页眉元素，按元素 id 索引，切 display 用 */
  private headerElements = new Map<string, UIKit.Text | null>();
  private popTween: gsap.core.Tween | null = null;
  /** 已应用的路由，用于在 update 中检测单真值变化（不做每帧分配） */
  private appliedRoute: AltarRouteValue = AltarRoute.None;
  /** 复用临时向量：按钮世界坐标/面板落点，零分配 */
  private readonly anchorWorld = new Vector3();

  init(): void {
    // 按钮按下 → 只写 route（thin command）
    this.cleanupFuncs.push(
      this.queries.pressedAltarButtons.subscribe('qualify', (entity) => {
        const altar = entity.getValue(AltarButton, 'altar') as AltarRouteValue;
        this.screenEntity?.setValue(AltarScreen, 'route', altar);
      }),
    );

    void this.bootstrap().catch((err) => {
      console.error('AltarScreenSystem 初始化失败:', err);
    });
  }

  private async bootstrap(): Promise<void> {
    // 面板与四张操作按钮图标一起预载，避免打开面板时出现 UI 加载中断
    const [panel, icons] = await Promise.all([
      loadUIKitMLAsset('altar-screen'),
      Promise.all(OP_BUTTONS.map((b) => AssetManager.loadTextureById(b.assetId))),
    ]);

    OP_BUTTONS.forEach((b, i) => {
      const icon = icons[i];
      if (icon) panel.getElementById(b.elementId)?.setProperties({ src: icon });
    });

    for (const id of Object.values(HEADER_ELEMENT_ID)) {
      this.headerElements.set(id, panel.getElementById<UIKit.Text>(id));
    }

    this.screenEntity = this.world.createTransformEntity(panel, {
      persistent: true,
    });
    this.screenEntity.addComponent(AltarScreen);
    // 面板单面朝 +Z：只旋转不位移地对准观察者（俯仰一并对准）
    this.screenEntity.addComponent(Billboard, { lockY: false });
    // 元素级点击需要 panel 节点带 RayInteractable
    this.screenEntity.addComponent(RayInteractable);

    const object = this.screenEntity.object3D;
    if (object) {
      this.disablePanelShadows(object);
      // 初始关闭：即时归 0 且不可见；位置在首次打开时按按钮锚点设定
      object.scale.setScalar(0);
      object.visible = false;
    }

    // 「返回」= 关闭：唯一需要实装的操作按钮，只写 route
    panel.getElementById('OpClose')?.addEventListener('click', () => {
      this.screenEntity?.setValue(AltarScreen, 'route', AltarRoute.None);
    });
  }

  /** route 变化才应用一次视觉，其余帧只做一次标量比较 */
  update(): void {
    const entity = this.screenEntity;
    if (!entity) return;
    const route = entity.getValue(AltarScreen, 'route') as AltarRouteValue;
    if (route === this.appliedRoute) return;
    this.appliedRoute = route;
    this.applyRoute(entity, route);
  }

  private applyRoute(entity: Entity, route: AltarRouteValue): void {
    const object = entity.object3D;
    if (!object) return;
    const open = route !== AltarRoute.None;

    this.popTween?.kill();
    this.popTween = null;

    if (open) {
      this.placeAboveAltarButton(object, route);
      this.setHeader(route);
      object.visible = true;
      object.scale.setScalar(POP_FROM);
      this.popTween = gsap.to(object.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: POP_DURATION,
        ease: POP_EASE,
      });
    } else {
      this.setHeader(null);
      object.scale.setScalar(0);
      object.visible = false;
    }

    this.setButtonsVisible(!open);
  }

  /** 面板移到 route 对应祭坛按钮的世界坐标正上方（先于按钮隐藏读取） */
  private placeAboveAltarButton(object: Object3D, route: AltarRouteValue): void {
    for (const button of this.queries.altarButtons.entities) {
      if (button.getValue(AltarButton, 'altar') !== route) continue;
      if (!button.object3D) return;
      button.object3D.getWorldPosition(this.anchorWorld);
      object.position.set(
        this.anchorWorld.x,
        this.anchorWorld.y + SCREEN_LIFT_Y,
        this.anchorWorld.z,
      );
      return;
    }
  }

  /** 只显示当前路由的页眉；null（关闭）时全部隐藏 */
  private setHeader(route: AltarRouteValue | null): void {
    const visibleId = route === null ? null : HEADER_ELEMENT_ID[route];
    for (const [id, element] of this.headerElements) {
      element?.setProperties({ display: id === visibleId ? 'flex' : 'none' });
    }
  }

  /** 关面板重显三按钮并重播 0→1 弹出动画；开面板即时归 0 并摘掉交互 */
  private setButtonsVisible(visible: boolean): void {
    for (const button of this.queries.altarButtons.entities) {
      const object = button.object3D;
      if (!object) continue;

      if (!visible) {
        object.scale.setScalar(0);
        object.visible = false;
        if (button.hasComponent(RayInteractable)) {
          button.removeComponent(RayInteractable);
        }
        continue;
      }

      object.visible = true;
      object.scale.setScalar(0);
      if (!button.hasComponent(RayInteractable)) {
        button.addComponent(RayInteractable);
      }
      gsap.to(object.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: BUTTON_POP_DURATION,
        ease: BUTTON_POP_EASE,
      });
    }
  }

  /** UI 不参与阴影投射/接收，避免面板在模型上投假影 */
  private disablePanelShadows(panel: Object3D): void {
    panel.traverse((child: Object3D) => {
      if (child instanceof Mesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });
  }

  destroy(): void {
    this.popTween?.kill();
  }
}
