import * as THREE from "three";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_Z,
  MAX_PIXEL_RATIO,
} from "./config";

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /** リサイズ時に追加で通知したいリスナを登録する (ポストエフェクト等) */
  onResize(listener: (width: number, height: number) => void): void;
}

/**
 * Three.js の Scene / Camera / Renderer を初期化し、リサイズ追従まで内包する。
 * リサイズでは pixel ratio も再適用することで、ブラウザを別DPIモニタに移した場合も追従する。
 */
export function createSceneContext(canvas: HTMLCanvasElement): SceneContext {
  // 背景は null (透明)。下層の residue canvas と body 背景色 (黒) が透けて見える
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    window.innerWidth / window.innerHeight,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
  camera.position.set(0, 0, CAMERA_Z);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  applyViewportSize(renderer);

  const resizeListeners: Array<(w: number, h: number) => void> = [];

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyViewportSize(renderer);
    for (const fn of resizeListeners) fn(window.innerWidth, window.innerHeight);
  });

  return {
    scene,
    camera,
    renderer,
    onResize(listener) {
      resizeListeners.push(listener);
    },
  };
}

function applyViewportSize(renderer: THREE.WebGLRenderer): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
}
