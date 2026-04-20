import * as THREE from "three";
import "./style.css";
import { createGlowTexture } from "./glowTexture";
import { SoundManager } from "./audio";
import {
  type Burst,
  type Rocket,
  createBurst,
  createRocket,
  updateBurst,
  updateRocket,
} from "./fireworks";

// ==============================
// Scene / Camera / Renderer
// ==============================
const canvas = document.getElementById("scene") as HTMLCanvasElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000010);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 0, 50);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// ==============================
// 共有リソース
// ==============================
const glowTexture = createGlowTexture();
const sound = new SoundManager();

const bursts: Burst[] = [];
const rockets: Rocket[] = [];

// ==============================
// アニメーションループ
// ==============================
const clock = new THREE.Clock();

function animate() {
  const now = clock.getElapsedTime();
  const dt = Math.min(clock.getDelta(), 0.05); // ブラウザタブ復帰時の巨大dt防止

  // Rocket更新: 到達したものはBurstに差し替え
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    if (updateRocket(r, scene, dt)) {
      bursts.push(
        createBurst(scene, glowTexture, r.target.x, r.target.y, r.target.z, now),
      );
      sound.playExplosion();
      rockets.splice(i, 1);
    }
  }

  // Burst更新: 寿命切れは自動削除
  for (let i = bursts.length - 1; i >= 0; i--) {
    if (updateBurst(bursts[i], scene, dt, now)) {
      bursts.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// ==============================
// 画面 px → z=0 平面上のワールド座標
// ==============================
function screenToWorld(clientX: number, clientY: number): THREE.Vector3 {
  const ndcX = (clientX / window.innerWidth) * 2 - 1;
  const ndcY = -((clientY / window.innerHeight) * 2 - 1);
  const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
  const dir = vec.sub(camera.position).normalize();
  const distance = -camera.position.z / dir.z;
  return camera.position.clone().add(dir.multiplyScalar(distance));
}

// ==============================
// タップ → Rocket発射
// ==============================
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();

  // iOSの音声制限を最初のタップで解除
  sound.ensureContext();

  const target = screenToWorld(e.clientX, e.clientY);

  // 打ち上げ開始位置: タップ真下・画面下端の少し外
  const bottomY = screenToWorld(e.clientX, window.innerHeight).y - 3;
  const start = new THREE.Vector3(target.x, bottomY, target.z);

  rockets.push(createRocket(scene, glowTexture, start, target));
  sound.playLaunch();
});

// ==============================
// リサイズ
// ==============================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
