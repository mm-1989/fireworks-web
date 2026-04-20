import * as THREE from "three";
import "./style.css";
import { SoundManager } from "./audio";
import { type Burst, createBurst, disposeBurst, updateBurst } from "./burst";
import { applyChargeToTheme, computeChargeStep } from "./charge";
import { createChargeIndicator } from "./chargeIndicator";
import { showClearOverlay } from "./clearOverlay";
import {
  CLEAR_CHECK_INTERVAL_SEC,
  CLEAR_FILL_THRESHOLD,
  DT_MAX,
  MAX_CONCURRENT_BURSTS,
  SHOOTING_STARS_MAX_CONCURRENT,
  SWIPE_SPEED_MAX_WORLD,
  SWIPE_SPEED_MIN_WORLD,
  SWIPE_STARS_MAX,
  SWIPE_STARS_PER_PX,
} from "./config";
import { mountDebugBadge } from "./debugBadge";
import { createGlowTexture } from "./glowTexture";
import { bindPointerGesture } from "./input";
import { detectPerformanceTier } from "./performanceTier";
import { createResidueLayer } from "./residue";
import { createSceneContext } from "./scene";
import { registerServiceWorker } from "./serviceWorker";
import {
  type ShootingStar,
  createShootingStar,
  disposeShootingStar,
  updateShootingStar,
} from "./shootingStar";
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
const chargeIndicator = createChargeIndicator();

// ---- Game state ----
const bursts: Burst[] = [];
const shootingStars: ShootingStar[] = [];
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
    if (updateBurst(bursts[i], scene, dt, now, stampBurstToResidue)) {
      bursts.splice(i, 1);
    }
  }

  for (let i = shootingStars.length - 1; i >= 0; i--) {
    if (updateShootingStar(shootingStars[i], scene, dt, now, stampPointToResidue)) {
      shootingStars.splice(i, 1);
    }
  }

  maybeCheckClear(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function stampBurstToResidue(burst: Burst): void {
  residue.stampBurst(burst);
}

function stampPointToResidue(
  pos: THREE.Vector3,
  color: THREE.Color,
  size: number,
): void {
  residue.stampPoint(pos, color, size);
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
        stampBurstToResidue(oldest);
      }
      disposeBurst(oldest, scene);
    }
  }
  bursts.push(createBurst(scene, theme, x, y, z, now));
}

/** 流れ星 1 本を生成。上限超過時は最古を破棄 */
function spawnShootingStar(
  start: THREE.Vector3,
  velocity: THREE.Vector3,
  color: THREE.Color,
  now: number,
): void {
  if (shootingStars.length >= SHOOTING_STARS_MAX_CONCURRENT) {
    const oldest = shootingStars.shift();
    if (oldest) disposeShootingStar(oldest, scene);
  }
  shootingStars.push(
    createShootingStar(scene, glowTexture, start, velocity, color, now),
  );
}

/** 現在のテーマ候補から 1 色サンプル (流れ星の色付け用) */
function pickStarColor(): THREE.Color {
  const theme = themePicker.pick();
  const color = new THREE.Color();
  if (theme.coloring.mode === "hsl") {
    const range = theme.coloring.hueRanges[0];
    color.setHSL(
      range.hueMin + Math.random() * (range.hueMax - range.hueMin),
      1.0,
      0.75,
    );
  } else {
    color.set(theme.coloring.color);
  }
  return color;
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

// ---- Input: タップ = 最小 burst、長押し = 10 段階チャージで拡大 + 混色 ----
/** 段階ごとの混色数。0-2=1色, 3-5=2色, 6-8=3色, 9-10=4色 */
function blendCountForStep(step: number): number {
  return Math.min(4, 1 + Math.floor(step / 3));
}

bindPointerGesture(sceneCanvas, camera, {
  onPressStart: ({ clientX, clientY }) => {
    if (cleared) return;
    sound.ensureContext();
    chargeIndicator.show(clientX, clientY);
  },
  onPressUpdate: (holdMs) => {
    chargeIndicator.setStep(computeChargeStep(holdMs));
  },
  onPressEnd: ({ target, holdMs }) => {
    chargeIndicator.hide();
    if (cleared) return;
    const step = computeChargeStep(holdMs);
    const base = themePicker.pickBlend(blendCountForStep(step));
    const theme = applyChargeToTheme(base, step);
    spawnBurst(theme, target.x, target.y, target.z, clock.elapsedTime);
    sound.playExplosion();
  },
  onSwipeStart: () => {
    chargeIndicator.hide();
  },
  onSwipe: ({ startTarget, endTarget, direction, worldSpeedPerSec, distancePx }) => {
    if (cleared) return;
    const count = Math.max(
      1,
      Math.min(SWIPE_STARS_MAX, Math.round(distancePx * SWIPE_STARS_PER_PX)),
    );
    const speed = Math.max(
      SWIPE_SPEED_MIN_WORLD,
      Math.min(SWIPE_SPEED_MAX_WORLD, worldSpeedPerSec),
    );
    const now = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const start = new THREE.Vector3().lerpVectors(startTarget, endTarget, t);
      // 進行方向に対して少しだけ直交方向にブレを入れる
      const jitter = (Math.random() - 0.5) * 2.0;
      start.x += -direction.y * jitter;
      start.y += direction.x * jitter;
      const velocity = direction.clone().multiplyScalar(speed);
      spawnShootingStar(start, velocity, pickStarColor(), now);
    }
    sound.playExplosion();
  },
});

registerServiceWorker();
