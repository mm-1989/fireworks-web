import * as THREE from "three";
import "./style.css";
import { createGlowTexture } from "./glowTexture";
import { createEmojiTexture } from "./emojiTexture";
import { SoundManager } from "./audio";
import { detectPerformanceTier } from "./performanceTier";
import {
  type Burst,
  type BurstTheme,
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
const perf = detectPerformanceTier();

// ==============================
// 右上にデバッグ用ティアバッジを表示
// ==============================
const badge = document.createElement("div");
badge.textContent = `${perf.tier} (${perf.cores}c${perf.memoryGB ? `/${perf.memoryGB}GB` : ""}) x${perf.scale}`;
Object.assign(badge.style, {
  position: "fixed",
  top: "6px",
  right: "8px",
  font: "10px monospace",
  color: "#ffffffaa",
  background: "#00000055",
  padding: "2px 6px",
  borderRadius: "4px",
  pointerEvents: "none",
  zIndex: "10",
});
document.body.appendChild(badge);

// ==============================
// テーマ定義
// ==============================
// 絵文字系: NormalBlending + uniform白 で絵文字の自然な色を保つ
// ピンク系: AdditiveBlending + HSL で光る花火らしさ
const pinkTheme: BurstTheme = {
  texture: glowTexture,
  particleCount: Math.round(600 * perf.scale),
  particleSize: 3.2, // 少し小さく
  speedMin: 14,
  speedMax: 32,
  gravity: -12,
  lifetime: 3.2,
  blending: THREE.AdditiveBlending,
  coloring: {
    mode: "hsl",
    hueMin: 0.92,
    hueMax: 0.96,
    sparkleChance: 0.08,
  },
  rocketColor: 0xff66cc,
};

function emojiTheme(emoji: string, rocketColor: number): BurstTheme {
  return {
    texture: createEmojiTexture(emoji, 128),
    particleCount: Math.max(24, Math.round(90 * perf.scale)), // 最低24粒は維持
    particleSize: 3.8, // 絵文字が読める程度の大きさ
    speedMin: 10,
    speedMax: 22,
    gravity: -10,
    lifetime: 3.0,
    blending: THREE.NormalBlending,
    coloring: { mode: "uniform", color: 0xffffff },
    rocketColor,
  };
}

const iceTheme = emojiTheme("🍦", 0xfff0b0);
const friesTheme = emojiTheme("🍟", 0xffcc33);
const strawberryTheme = emojiTheme("🍓", 0xff4466);
const donutTheme = emojiTheme("🍩", 0xff99bb);

// タップごとに重み付きランダムで選ぶ
// 5% ピンク / 食べ物 各 ~23.75%
const themePool: { theme: BurstTheme; weight: number }[] = [
  { theme: pinkTheme, weight: 5 },
  { theme: iceTheme, weight: 24 },
  { theme: friesTheme, weight: 24 },
  { theme: strawberryTheme, weight: 24 },
  { theme: donutTheme, weight: 23 },
];
const totalWeight = themePool.reduce((s, t) => s + t.weight, 0);

function pickTheme(): BurstTheme {
  let r = Math.random() * totalWeight;
  for (const entry of themePool) {
    r -= entry.weight;
    if (r <= 0) return entry.theme;
  }
  return themePool[0].theme;
}

const bursts: Burst[] = [];
const rockets: Rocket[] = [];

// ==============================
// アニメーションループ
// ==============================
const clock = new THREE.Clock();

function animate() {
  // 注意: clock.getDelta() を先に呼ぶこと。getElapsedTime()は内部でgetDelta()を
  //       呼び時計を進めるため、先にElapsedを取ると後続のgetDelta()は≒0になる
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = clock.elapsedTime;

  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    if (updateRocket(r, scene, dt)) {
      bursts.push(
        createBurst(scene, r.burstTheme, r.target.x, r.target.y, r.target.z, now),
      );
      sound.playExplosion();
      rockets.splice(i, 1);
    }
  }

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

  sound.ensureContext();

  const target = screenToWorld(e.clientX, e.clientY);
  const bottomY = screenToWorld(e.clientX, window.innerHeight).y - 3;
  const start = new THREE.Vector3(target.x, bottomY, target.z);

  const theme = pickTheme();
  rockets.push(createRocket(scene, glowTexture, start, target, theme));
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

// ==============================
// Service Worker 登録
// ==============================
// 本番ビルドのみ登録 (dev では Viteのホットリロードと衝突するため)
// load後に登録すると初回ペイントに影響しない
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("[sw] registered:", reg.scope))
      .catch((err) => console.warn("[sw] register failed:", err));
  });
}
