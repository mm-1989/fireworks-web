import * as THREE from "three";
import { CHARGE_MOVE_CANCEL_PX } from "./config";

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

export interface PressCancelEvent {
  reason: "move";
  clientX: number;
  clientY: number;
}

export interface PressGestureHandlers {
  /** pointerdown 時に 1 回。AudioContext 初期化などの「最初のジェスチャ」フックに使う */
  onPressStart?(event: PressEvent): void;
  /** requestAnimationFrame で呼ばれる。holdMs はミリ秒 */
  onPressUpdate?(holdMs: number): void;
  /** pointerup 時に 1 回。move による中断が起きた場合は呼ばれない */
  onPressEnd?(event: PressReleaseEvent): void;
  /** 指が閾値を越えて動いたときに 1 回 (Phase C のスワイプ用フック) */
  onPressCancel?(event: PressCancelEvent): void;
}

/**
 * canvas 上のプレス/長押しを購読する。
 * - move で CHARGE_MOVE_CANCEL_PX を越えたら中断 → onPressCancel
 * - touch-action: none 前提のため preventDefault は不要
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
  let cancelled = false;
  let rafId = 0;

  const cancelThresholdSq = CHARGE_MOVE_CANCEL_PX * CHARGE_MOVE_CANCEL_PX;

  function tick(): void {
    if (activePointerId == null || cancelled) return;
    handlers.onPressUpdate?.(performance.now() - startTime);
    rafId = requestAnimationFrame(tick);
  }

  function finish(): void {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    activePointerId = null;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (activePointerId != null) return;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startTime = performance.now();
    cancelled = false;
    const target = screenToWorld(camera, e.clientX, e.clientY);
    handlers.onPressStart?.({ clientX: e.clientX, clientY: e.clientY, target });
    rafId = requestAnimationFrame(tick);
  });

  window.addEventListener("pointermove", (e) => {
    if (e.pointerId !== activePointerId || cancelled) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy > cancelThresholdSq) {
      cancelled = true;
      handlers.onPressCancel?.({
        reason: "move",
        clientX: e.clientX,
        clientY: e.clientY,
      });
      finish();
    }
  });

  function end(e: PointerEvent): void {
    if (e.pointerId !== activePointerId) return;
    if (cancelled) {
      finish();
      return;
    }
    const holdMs = performance.now() - startTime;
    const target = screenToWorld(camera, e.clientX, e.clientY);
    finish();
    handlers.onPressEnd?.({
      clientX: e.clientX,
      clientY: e.clientY,
      target,
      holdMs,
    });
  }
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}
