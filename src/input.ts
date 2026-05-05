import * as THREE from "three";
import {
  CHARGE_MOVE_CANCEL_PX,
  SWIPE_TRIGGER_VELOCITY_PX_PER_SEC,
  SWIPE_TRIGGER_VELOCITY_WINDOW_MS,
  SWIPE_VELOCITY_WINDOW_MS,
} from "./config";

/**
 * 画面 px → z=0 平面上のワールド座標
 * 内部で新規 Vector3 を割り当てるため、ホットループから呼ぶ用途には向かない。
 */
export function screenToWorld(
  camera: THREE.PerspectiveCamera,
  clientX: number,
  clientY: number,
): THREE.Vector3 {
  const ndcX = (clientX / window.innerWidth) * 2 - 1;
  const ndcY = -((clientY / window.innerHeight) * 2 - 1);
  const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
  const dir = vec.sub(camera.position).normalize();
  const distance = -camera.position.z / dir.z;
  return camera.position.clone().add(dir.multiplyScalar(distance));
}

export interface PressEvent {
  clientX: number;
  clientY: number;
  target: THREE.Vector3;
}

export interface PressReleaseEvent extends PressEvent {
  /** 押下開始から release までの経過時間 (ms) */
  holdMs: number;
}

export interface SwipeStartEvent {
  clientX: number;
  clientY: number;
}

export interface SwipeEvent {
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  /** end - start の単位ベクトル (world) */
  direction: THREE.Vector3;
  /** スワイプ終盤 SWIPE_VELOCITY_WINDOW_MS の瞬間速度 (world/s) */
  worldSpeedPerSec: number;
  /** 始点〜終点の画面距離 (px)。本数換算用 */
  distancePx: number;
  durationMs: number;
}

export interface StrokeMoveEvent {
  target: THREE.Vector3;
  prevTarget: THREE.Vector3;
}

export interface PressGestureHandlers {
  /** pointerdown 時に 1 回。AudioContext 初期化などの「最初のジェスチャ」フックに使う */
  onPressStart?(event: PressEvent): void;
  /** requestAnimationFrame で呼ばれる。holdMs はミリ秒 */
  onPressUpdate?(holdMs: number): void;
  /** pointerup 時に 1 回。スワイプに遷移した場合は呼ばれない */
  onPressEnd?(event: PressReleaseEvent): void;
  /** 指が閾値を越えた瞬間に 1 回。charge UI の撤収などに使う */
  onSwipeStart?(event: SwipeStartEvent): void;
  /** pointerup 時にスワイプ扱いとして呼ばれる */
  onSwipe?(event: SwipeEvent): void;
  /** 描画モード時 pointerdown */
  onStrokeStart?(event: PressEvent): void;
  /** 描画モード時 pointermove */
  onStrokeMove?(event: StrokeMoveEvent): void;
  /** 描画モード時 pointerup */
  onStrokeEnd?(): void;
  /**
   * pointerdown 時に評価され、true なら描画モードとして扱う。
   * 操作中にモードが変わっても進行中のジェスチャは pointerdown 時の判定で完走させる
   * (途中で切り替わると charge/swipe/stroke の状態が混ざって破綻するため)。
   */
  isDrawingMode?(): boolean;
}

interface Sample {
  clientX: number;
  clientY: number;
  t: number;
}

/**
 * canvas 上のプレス/長押し/スワイプを購読する。
 *
 * 状態遷移:
 *   idle → pressing    on pointerdown
 *   pressing → swiping on pointermove で「距離 > MOVE_CANCEL_PX かつ 直近速度 > TRIGGER_VELOCITY」
 *   pressing → idle    on pointerup  (→ onPressEnd)
 *   swiping  → idle    on pointerup  (→ onSwipe)
 *
 * 距離だけで判定すると押下中の微小ドリフトで誤判定するため、フリック様の
 * 速度条件を AND で課す。ゆっくり指がずれる動きはタップ扱いのまま続行する。
 *
 * touch-action: none 前提のため preventDefault は不要。
 */
export function bindPointerGesture(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  handlers: PressGestureHandlers,
): void {
  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let swiping = false;
  /** pointerdown 時に isDrawingMode() を評価して固定。操作中の挙動分岐に使う */
  let drawing = false;
  let prevStrokeWorld: THREE.Vector3 | null = null;
  let rafId = 0;
  const samples: Sample[] = [];

  const cancelThresholdSq = CHARGE_MOVE_CANCEL_PX * CHARGE_MOVE_CANCEL_PX;

  function tick(): void {
    if (activePointerId == null || swiping) return;
    handlers.onPressUpdate?.(performance.now() - startTime);
    rafId = requestAnimationFrame(tick);
  }

  function finish(): void {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    activePointerId = null;
    swiping = false;
    drawing = false;
    prevStrokeWorld = null;
    samples.length = 0;
  }

  function pushSample(clientX: number, clientY: number, t: number): void {
    samples.push({ clientX, clientY, t });
    // 古すぎるサンプルを捨てる (先頭 1 件は速度計算の基準として最低限残す)
    const cutoff = t - SWIPE_VELOCITY_WINDOW_MS;
    while (samples.length > 2 && samples[0].t < cutoff) {
      samples.shift();
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (activePointerId != null) return;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startTime = performance.now();
    swiping = false;
    samples.length = 0;
    pushSample(e.clientX, e.clientY, startTime);
    const target = screenToWorld(camera, e.clientX, e.clientY);
    drawing = handlers.isDrawingMode?.() === true;
    if (drawing) {
      prevStrokeWorld = target.clone();
      handlers.onStrokeStart?.({ clientX: e.clientX, clientY: e.clientY, target });
      return;
    }
    handlers.onPressStart?.({ clientX: e.clientX, clientY: e.clientY, target });
    rafId = requestAnimationFrame(tick);
  });

  window.addEventListener("pointermove", (e) => {
    if (e.pointerId !== activePointerId) return;
    const t = performance.now();
    pushSample(e.clientX, e.clientY, t);
    if (drawing) {
      if (!handlers.onStrokeMove || !prevStrokeWorld) return;
      const target = screenToWorld(camera, e.clientX, e.clientY);
      handlers.onStrokeMove({ target, prevTarget: prevStrokeWorld });
      prevStrokeWorld = target;
      return;
    }
    if (swiping) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy <= cancelThresholdSq) return;
    // 距離は越えたが、フリック様の速度がない限り「タップ中の微小移動」と扱う
    if (recentVelocityPxPerSec(t) < SWIPE_TRIGGER_VELOCITY_PX_PER_SEC) return;
    swiping = true;
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    handlers.onSwipeStart?.({ clientX: e.clientX, clientY: e.clientY });
  });

  /** 直近 SWIPE_TRIGGER_VELOCITY_WINDOW_MS の瞬間速度 (px/s) */
  function recentVelocityPxPerSec(now: number): number {
    if (samples.length < 2) return 0;
    const last = samples[samples.length - 1];
    const cutoff = now - SWIPE_TRIGGER_VELOCITY_WINDOW_MS;
    const first = samples.find((s) => s.t >= cutoff) ?? samples[0];
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return 0;
    return Math.hypot(last.clientX - first.clientX, last.clientY - first.clientY) / dt;
  }

  function end(e: PointerEvent): void {
    if (e.pointerId !== activePointerId) return;
    const endTime = performance.now();
    pushSample(e.clientX, e.clientY, endTime);

    if (drawing) {
      handlers.onStrokeEnd?.();
    } else if (swiping) {
      fireSwipe(endTime, camera, handlers);
    } else {
      const target = screenToWorld(camera, e.clientX, e.clientY);
      handlers.onPressEnd?.({
        clientX: e.clientX,
        clientY: e.clientY,
        target,
        holdMs: endTime - startTime,
      });
    }
    finish();
  }

  function cancel(e: PointerEvent): void {
    if (e.pointerId !== activePointerId) return;
    finish();
  }

  function fireSwipe(
    endTime: number,
    cam: THREE.PerspectiveCamera,
    h: PressGestureHandlers,
  ): void {
    if (!h.onSwipe) return;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const startTarget = screenToWorld(cam, first.clientX, first.clientY);
    const endTarget = screenToWorld(cam, last.clientX, last.clientY);
    const distancePx = Math.hypot(
      last.clientX - first.clientX,
      last.clientY - first.clientY,
    );
    const durationMs = endTime - startTime;

    // 直近ウィンドウでの瞬間速度 (world/s)
    const windowFirst =
      samples.find((s) => endTime - s.t <= SWIPE_VELOCITY_WINDOW_MS) ?? first;
    const winStart = screenToWorld(cam, windowFirst.clientX, windowFirst.clientY);
    const winDt = Math.max(0.001, (last.t - windowFirst.t) / 1000);
    const worldSpeedPerSec = winStart.distanceTo(endTarget) / winDt;

    const direction = new THREE.Vector3()
      .subVectors(endTarget, startTarget)
      .normalize();

    h.onSwipe({
      startTarget,
      endTarget,
      direction,
      worldSpeedPerSec,
      distancePx,
      durationMs,
    });
  }

  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", cancel);
}
