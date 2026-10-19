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

/**
 * GAMES 页槽位：元素 id 与跳转 URL 同序。槽位 1/2 预留（uikitml 中 display:none）。
 * 列表严格从顶部开始堆叠（flex-start），单游戏也不例外。
 * 接入新游戏：补 URL、在 uikitml 摘掉对应槽位的隐藏类。OpPrev/OpNext 暂不接能力。
 */
const GAME_SLOTS = [
  { elementId: 'GameSlot0', url: '/games/harbor-defender/' },
  { elementId: 'GameSlot1', url: '' },
  { elementId: 'GameSlot2', url: '' },
] as const;

/** 槽位配色：未选中藏青蓝，选中浅蓝底加白描边；文字恒白（在 uikitml 中定色） */
const SLOT_COLOR_BASE = '#1e4e79';
const SLOT_COLOR_SELECTED = '#5b9bd5';
const SLOT_BORDER_SELECTED = '#ffffff';

/** 面板弹出动画参数（原 main：显示 0.8→1，0.3s，power2.out） */
const POP_FROM = 0.8;
const POP_DURATION = 0.3;

/** 祭坛按钮重显动画参数（原 main AltarButton：0→1，0.5s，power1.in） */
const BUTTON_POP_DURATION = 0.5;

/** 面板弹出缓动：power2.out */
const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);

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
  /** GAMES 页列表容器与槽位按钮，切 display / 高亮用 */
  private gameListElement: UIKit.Text | null = null;
  private slotElements: Array<UIKit.Text | null> = [];
  /** 已应用的路由，用于在 update 中检测单真值变化（不做每帧分配） */
  private appliedRoute: AltarRouteValue = AltarRoute.None;
  /** 已应用的高亮槽位，-1 表示尚未应用（首开必刷一次高亮） */
  private appliedGameIndex = -1;
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

    this.gameListElement = panel.getElementById<UIKit.Text>('GameList');
    this.slotElements = GAME_SLOTS.map((slot) =>
      panel.getElementById<UIKit.Text>(slot.elementId),
    );
    // 点选槽位 → 只写 gameIndex（thin command），高亮由 update 派生
    GAME_SLOTS.forEach((slot, index) => {
      panel.getElementById(slot.elementId)?.addEventListener('click', () => {
        this.screenEntity?.setValue(AltarScreen, 'gameIndex', index);
      });
    });

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

    // 「确定」：GAMES 页整页跳转当前选中槽位的子游戏（会结束当前 XR 会话）
    panel.getElementById('OpConfirm')?.addEventListener('click', () => {
      const entity = this.screenEntity;
      if (!entity) return;
      const route = entity.getValue(AltarScreen, 'route') as AltarRouteValue;
      if (route !== AltarRoute.Heart) return;
      const index = entity.getValue(AltarScreen, 'gameIndex') as number;
      const url = GAME_SLOTS[index]?.url;
      if (url) window.location.href = url;
    });
  }

  /**
   * 每帧两件事：弹出积分（visible 且 pop<1 的面板/按钮，纯标量）+ 单真值变化检测。
   * 无变化且无进行中弹出时只做少量标量比较，零分配。
   */
  update(delta: number): void {
    const entity = this.screenEntity;
    if (entity) {
      this.advancePanelPop(entity, delta);
      const route = entity.getValue(AltarScreen, 'route') as AltarRouteValue;
      const gameIndex = entity.getValue(AltarScreen, 'gameIndex') as number;
      if (route !== this.appliedRoute || gameIndex !== this.appliedGameIndex) {
        const routeChanged = route !== this.appliedRoute;
        this.appliedRoute = route;
        this.appliedGameIndex = gameIndex;
        if (routeChanged) this.applyRoute(entity, route);
        this.applyHighlight(gameIndex);
      }
    }
    this.advanceButtonPops(delta);
  }

  /** 面板弹出积分：scale = 0.8 + 0.2×easeOut(pop)，由 pop 派生 */
  private advancePanelPop(entity: Entity, delta: number): void {
    const object = entity.object3D;
    if (!object || !object.visible) return;
    const pop = entity.getValue(AltarScreen, 'pop') ?? 0;
    if (pop >= 1) return;
    const np = Math.min(pop + delta / POP_DURATION, 1);
    entity.setValue(AltarScreen, 'pop', np);
    object.scale.setScalar(POP_FROM + (1 - POP_FROM) * easeOut(np));
  }

  /** 按钮弹出积分：scale = pop²（power1.in），pop≥1 时补上可点 */
  private advanceButtonPops(delta: number): void {
    for (const button of this.queries.altarButtons.entities) {
      const object = button.object3D;
      if (!object || !object.visible) continue;
      const pop = button.getValue(AltarButton, 'pop') ?? 0;
      if (pop >= 1) continue;
      const np = Math.min(pop + delta / BUTTON_POP_DURATION, 1);
      button.setValue(AltarButton, 'pop', np);
      object.scale.setScalar(np * np);
      if (np >= 1 && !button.hasComponent(RayInteractable)) {
        button.addComponent(RayInteractable);
      }
    }
  }

  private applyRoute(entity: Entity, route: AltarRouteValue): void {
    const object = entity.object3D;
    if (!object) return;
    const open = route !== AltarRoute.None;

    if (open) {
      this.placeAboveAltarButton(object, route);
      this.setHeader(route);
      this.setGameListVisible(route === AltarRoute.Heart);
      if (route === AltarRoute.Heart) {
        entity.setValue(AltarScreen, 'gameIndex', 0);
      }
      object.visible = true;
      entity.setValue(AltarScreen, 'pop', 0);
      // 首帧即 0.8 避免闪 0，后续帧由 advancePanelPop 积分推进到 1
      object.scale.setScalar(POP_FROM);
    } else {
      this.setHeader(null);
      this.setGameListVisible(false);
      object.scale.setScalar(0);
      object.visible = false;
      entity.setValue(AltarScreen, 'pop', 0);
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

  /** GAMES 页列表只在 heart 路由显示 */
  private setGameListVisible(visible: boolean): void {
    this.gameListElement?.setProperties({ display: visible ? 'flex' : 'none' });
  }

  /** 选中槽位浅蓝底加白描边，其余藏青蓝同色描边（视觉无边）；文字恒白不参与 */
  private applyHighlight(gameIndex: number): void {
    this.slotElements.forEach((element, i) => {
      const selected = i === gameIndex;
      element?.setProperties({
        backgroundColor: selected ? SLOT_COLOR_SELECTED : SLOT_COLOR_BASE,
        borderColor: selected ? SLOT_BORDER_SELECTED : SLOT_COLOR_BASE,
      });
    });
  }

  /**
   * 关面板隐藏三按钮（即时归 0、摘交互）；开面板重显并从 pop 0 重新积分。
   * 可点时机统一由 advanceButtonPops 在 pop≥1 时补 RayInteractable。
   */
  private setButtonsVisible(visible: boolean): void {
    for (const button of this.queries.altarButtons.entities) {
      const object = button.object3D;
      if (!object) continue;

      button.setValue(AltarButton, 'pop', 0);

      if (!visible) {
        object.scale.setScalar(0);
        object.visible = false;
        if (button.hasComponent(RayInteractable)) {
          button.removeComponent(RayInteractable);
        }
        continue;
      }

      object.scale.setScalar(0);
      object.visible = true;
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
}
