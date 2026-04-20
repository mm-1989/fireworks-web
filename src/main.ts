import * as THREE from "three";
import "./style.css";
import { SoundManager } from "./audio";
import { type Burst, createBurst, disposeBurst, updateBurst } from "./burst";
import {
  applyChargeToTheme,
  blendCountForStep,
  computeChargeStep,
} from "./charge";
import { createChargeIndicator } from "./chargeIndicator";
import { showClearCeremony } from "./clearCeremony";
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
import { buildFileName, saveImage } from "./imageExport";
import { bindPointerGesture } from "./input";
import { detectPerformanceTier } from "./performanceTier";
import { createPostFx } from "./postFx";
import { createResidueLayer } from "./residue";
import { createSceneContext } from "./scene";
import { sparkleUniforms } from "./sparkleShader";
import { registerServiceWorker } from "./serviceWorker";
import {
  type ShootingStar,
  createShootingStar,
  disposeShootingStar,
  updateShootingStar,
} from "./shootingStar";
import { createThemePicker } from "./themes";

// ---- DOM ----
const sceneCanvasEl = document.getElementById("scene");
const residueCanvasEl = document.getElementById("residue");
if (!(sceneCanvasEl instanceof HTMLCanvasElement)) {
  throw new Error('Expected <canvas id="scene"> in index.html');
}
if (!(residueCanvasEl instanceof HTMLCanvasElement)) {
  throw new Error('Expected <canvas id="residue"> in index.html');
}
// 関数内から参照したときに TS の型絞り込みが外れるため、narrowed な別名に再束縛する
const sceneCanvas: HTMLCanvasElement = sceneCanvasEl;
const residueCanvas: HTMLCanvasElement = residueCanvasEl;

// ---- Core systems ----
const sceneCtx = createSceneContext(sceneCanvas);
const { scene, camera, renderer } = sceneCtx;
const glowTexture = createGlowTexture();
const sound = new SoundManager();
const perf = detectPerformanceTier();
const postFx = createPostFx(renderer, scene, camera, perf);
sceneCtx.onResize((w, h) => postFx.setSize(w, h));
const themePicker = createThemePicker(glowTexture, perf);
const residue = createResidueLayer(residueCanvas, camera);
const debugBadge = mountDebugBadge(perf);
const chargeIndicator = createChargeIndicator();

// ---- Game state ----
const bursts: Burst[] = [];
const shootingStars: ShootingStar[] = [];
const clock = new THREE.Clock();
const accentColor = new THREE.Color();
let cleared = false;
let secondsSinceLastCheck = 0;

// ---- Main loop ----
function animate(): void {
  // 注意: clock.getDelta() を先に呼ぶこと。getElapsedTime() は内部で getDelta() を
  //       呼び時計を進めるため、先に elapsed を取ると後続の getDelta() は ≒0 になる。
  const dt = Math.min(clock.getDelta(), DT_MAX);
  const now = clock.elapsedTime;
  sparkleUniforms.uTime.value = now;

  for (let i = bursts.length - 1; i >= 0; i--) {
    if (updateBurst(bursts[i], scene, dt, now, residue.stampBurst)) {
      bursts.splice(i, 1);
    }
  }

  for (let i = shootingStars.length - 1; i >= 0; i--) {
    if (updateShootingStar(shootingStars[i], scene, dt, now, residue.stampPoint)) {
      shootingStars.splice(i, 1);
    }
  }

  maybeCheckClear(dt);
  postFx.render();
  requestAnimationFrame(animate);
}

/**
 * 新規 burst を生成。上限を超える場合は最古の burst を即時焼き付け+破棄して枠を確保する。
 * 連打時の同時粒子数爆発を抑え、iOS でのフレーム落ちを防ぐ。
 */
function spawnBurst(step: number, x: number, y: number, z: number, now: number): void {
  if (bursts.length >= MAX_CONCURRENT_BURSTS) {
    const oldest = bursts.shift();
    if (oldest) {
      if (!oldest.stamped) {
        oldest.stamped = true;
        residue.stampBurst(oldest);
      }
      disposeBurst(oldest, scene);
    }
  }
  const base = themePicker.pickBlend(blendCountForStep(step));
  const theme = applyChargeToTheme(base, step);
  bursts.push(createBurst(scene, theme, x, y, z, now));
}

/** 流れ星 1 本を生成。上限超過時は最古を破棄 */
function spawnShootingStar(
  start: THREE.Vector3,
  velocity: THREE.Vector3,
  now: number,
): void {
  if (shootingStars.length >= SHOOTING_STARS_MAX_CONCURRENT) {
    const oldest = shootingStars.shift();
    if (oldest) disposeShootingStar(oldest, scene);
  }
  const color = themePicker.pickAccentColor(accentColor).clone();
  shootingStars.push(
    createShootingStar(scene, glowTexture, start, velocity, color, now),
  );
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
    onClear();
  }
}

/** クリア演出を呼び出す。residue を黒背景で画像化してから ceremony を開く */
function onClear(): void {
  // 押下中にクリアに達した場合、インジケータが画面に残るので明示的に隠す
  chargeIndicator.hide();
  const dataUrl = residue.toDataURL();
  const fileName = buildFileName();
  showClearCeremony(dataUrl, {
    onSave: () => saveImage(dataUrl, fileName),
    onRestart: () => reset(),
  });
}

/** ゲーム状態を初期化。クリア演出から「もういちど」で呼ばれる */
function reset(): void {
  for (const b of bursts) disposeBurst(b, scene);
  for (const s of shootingStars) disposeShootingStar(s, scene);
  bursts.length = 0;
  shootingStars.length = 0;
  residue.clear();
  cleared = false;
  secondsSinceLastCheck = 0;
  debugBadge.setFillRate(0);
}

animate();

// ---- Input: タップ = 最小 burst、長押し = 10 段階チャージで拡大 + 混色 ----
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
    spawnBurst(
      computeChargeStep(holdMs),
      target.x,
      target.y,
      target.z,
      clock.elapsedTime,
    );
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
      spawnShootingStar(start, velocity, now);
    }
    sound.playExplosion();
  },
});

registerServiceWorker();
