import * as THREE from "three";
import "./style.css";
import { SoundManager } from "./audio";
import { type Burst, createBurst, disposeBurst, updateBurst } from "./burst";
import { showClearOverlay } from "./clearOverlay";
import {
  CLEAR_CHECK_INTERVAL_SEC,
  CLEAR_FILL_THRESHOLD,
  DT_MAX,
  MAX_CONCURRENT_BURSTS,
} from "./config";
import { mountDebugBadge } from "./debugBadge";
import { createGlowTexture } from "./glowTexture";
import { bindPointerLaunch } from "./input";
import { detectPerformanceTier } from "./performanceTier";
import { createResidueLayer } from "./residue";
import { createSceneContext } from "./scene";
import { registerServiceWorker } from "./serviceWorker";
import { type BurstTheme, createThemePicker } from "./themes";

// ---- DOM ----
const sceneCanvas = document.getElementById("scene");
const residueCanvas = document.getElementById("residue");
if (!(sceneCanvas instanceof HTMLCanvasElement)) {
  throw new Error('Expected <canvas id="scene"> in index.html');
}
if (!(residueCanvas instanceof HTMLCanvasElement)) {
  throw new Error('Expected <canvas id="residue"> in index.html');
}

// ---- Core systems ----
const { scene, camera, renderer } = createSceneContext(sceneCanvas);
const glowTexture = createGlowTexture();
const sound = new SoundManager();
const perf = detectPerformanceTier();
const themePicker = createThemePicker(glowTexture, perf);
const residue = createResidueLayer(residueCanvas, camera);
const debugBadge = mountDebugBadge(perf);

// ---- Game state ----
const bursts: Burst[] = [];
const clock = new THREE.Clock();
let cleared = false;
let secondsSinceLastCheck = 0;

// ---- Main loop ----
function animate(): void {
  // 注意: clock.getDelta() を先に呼ぶこと。getElapsedTime() は内部で getDelta() を
  //       呼び時計を進めるため、先に elapsed を取ると後続の getDelta() は ≒0 になる。
  const dt = Math.min(clock.getDelta(), DT_MAX);
  const now = clock.elapsedTime;

  for (let i = bursts.length - 1; i >= 0; i--) {
    if (updateBurst(bursts[i], scene, dt, now, stampToResidue)) {
      bursts.splice(i, 1);
    }
  }

  maybeCheckClear(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function stampToResidue(burst: Burst): void {
  residue.stampBurst(burst);
}

/**
 * 新規 burst を生成。上限を超える場合は最古の burst を即時焼き付け+破棄して枠を確保する。
 * 連打時の同時粒子数爆発を抑え、iOS でのフレーム落ちを防ぐ。
 */
function spawnBurst(
  theme: BurstTheme,
  x: number,
  y: number,
  z: number,
  now: number,
): void {
  if (bursts.length >= MAX_CONCURRENT_BURSTS) {
    const oldest = bursts.shift();
    if (oldest) {
      if (!oldest.stamped) {
        oldest.stamped = true;
        stampToResidue(oldest);
      }
      disposeBurst(oldest, scene);
    }
  }
  bursts.push(createBurst(scene, theme, x, y, z, now));
}

function maybeCheckClear(dt: number): void {
  if (cleared) return;
  secondsSinceLastCheck += dt;
  if (secondsSinceLastCheck < CLEAR_CHECK_INTERVAL_SEC) return;
  secondsSinceLastCheck = 0;

  const rate = residue.computeFillRate();
  debugBadge.setFillRate(rate);

  if (rate >= CLEAR_FILL_THRESHOLD) {
    cleared = true;
    console.log(`[clear] fill rate = ${(rate * 100).toFixed(1)}%`);
    showClearOverlay();
  }
}

animate();

// ---- Input: タップ位置で即炸裂 ----
bindPointerLaunch(sceneCanvas, camera, ({ target }) => {
  if (cleared) return;
  sound.ensureContext();
  const theme = themePicker.pick();
  spawnBurst(theme, target.x, target.y, target.z, clock.elapsedTime);
  sound.playExplosion();
});

registerServiceWorker();
