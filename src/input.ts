import * as THREE from "three";

export interface WorldPointerEvent {
  /** タップされた画面座標を z=0 平面に投影したワールド座標 */
  target: THREE.Vector3;
  /** 画面下端より少し下 (発射元) のワールド座標 */
  launchFloor: THREE.Vector3;
}

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

/**
 * canvas 上の pointerdown を購読し、ワールド座標に変換して handler に渡す。
 * touch-action: none 前提のため preventDefault は不要。
 */
export function bindPointerLaunch(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  handler: (event: WorldPointerEvent) => void,
): void {
  canvas.addEventListener("pointerdown", (e) => {
    const target = screenToWorld(camera, e.clientX, e.clientY);
    const launchFloor = screenToWorld(camera, e.clientX, window.innerHeight);
    handler({ target, launchFloor });
  });
}
