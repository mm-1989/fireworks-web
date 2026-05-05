import * as THREE from "three";
import "./style.css";
import { SoundManager } from "./audio";
import { type Burst, createBurst, disposeBurst, updateBurst } from "./burst";
import {
  applyChargeToTheme,
  blendCountForStep,
  computeChargeStep,
} from "./charge";
import { type ChargeAura, createChargeAura } from "./chargeAura";
import { createChargeIndicator } from "./chargeIndicator";
import { showClearCeremony } from "./clearCeremony";
import {
  CLEAR_CHECK_INTERVAL_SEC,
  CLEAR_FILL_THRESHOLD,
  DRAWING_ALPHA_SCALE,
  DRAWING_BRUSH_SIZE,
  DT_MAX,
  MAX_CONCURRENT_BURSTS,
} from "./config";
import { mountDebugBadge } from "./debugBadge";
import { createCrossRayTexture, createGlowTexture } from "./glowTexture";
import { buildFileName, saveImage } from "./imageExport";
import { bindPointerGesture } from "./input";
import { detectPerformanceTier } from "./performanceTier";
import { createPostFx } from "./postFx";
import { createResidueLayer } from "./residue";
import { createResidueCrosses } from "./residueCrosses";
import { createResidueSparkles } from "./residueSparkles";
import { createSceneContext } from "./scene";
import { sparkleUniforms } from "./sparkleShader";
import { registerServiceWorker } from "./serviceWorker";
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
const crossRayTexture = createCrossRayTexture();
const sound = new SoundManager();
const perf = detectPerformanceTier();
const postFx = createPostFx(renderer, scene, camera, perf);
sceneCtx.onResize((w, h) => postFx.setSize(w, h));
const themePicker = createThemePicker(glowTexture, perf);
const residueCrosses = createResidueCrosses(scene, crossRayTexture);
const residue = createResidueLayer(residueCanvas, camera, residueCrosses);
const residueSparkles = createResidueSparkles(
  scene,
  glowTexture,
  camera,
  residueCanvas,
);
const debugBadge = mountDebugBadge(perf);
const chargeIndicator = createChargeIndicator();

// ---- Game state ----
const bursts: Burst[] = [];
const clock = new THREE.Clock();
let cleared = false;
let secondsSinceLastCheck = 0;
/** 押下中だけ存在する aura。onPressStart で生成、onPressEnd/onStrokeStart/onClear で dispose */
let chargeAura: ChargeAura | null = null;
/** 1 ストロークで使い続ける色。onStrokeStart で確定 */
const strokeColor = new THREE.Color();

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

  chargeAura?.update(dt);
  residueSparkles.update(dt);

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
        residue.stampBurst(oldest, now);
      }
      disposeBurst(oldest, scene);
    }
  }
  const base = themePicker.pickBlend(blendCountForStep(step));
  const theme = applyChargeToTheme(base, step);
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
    onClear();
  }
}

/** クリア演出を呼び出す。residue を黒背景で画像化してから ceremony を開く */
function onClear(): void {
  // 押下中にクリアに達した場合、インジケータ/aura が画面に残るので明示的に破棄する
  chargeIndicator.hide();
  disposeChargeAura();
  // residue 2D canvas に加え、GL scene (residueCrosses の十字含む) もスナップ。
  // preserveDrawingBuffer=false のため、同 tick 内で render → toDataURL を呼ぶ。
  postFx.render();
  const dataUrl = residue.toDataURL(sceneCanvas);
  const fileName = buildFileName();
  showClearCeremony(dataUrl, {
    onSave: () => saveImage(dataUrl, fileName),
    onRestart: () => reset(),
  });
}

/** ゲーム状態を初期化。クリア演出から「もういちど」で呼ばれる */
function reset(): void {
  for (const b of bursts) disposeBurst(b, scene);
  bursts.length = 0;
  disposeChargeAura();
  residue.clear();
  cleared = false;
  secondsSinceLastCheck = 0;
  debugBadge.setFillRate(0);
}

function disposeChargeAura(): void {
  if (chargeAura) {
    chargeAura.dispose();
    chargeAura = null;
  }
}

animate();

// ---- Input: タップ→花火、ドラッグ→軌跡 ----
bindPointerGesture(sceneCanvas, camera, {
  onPressStart: ({ clientX, clientY, target }) => {
    if (cleared) return;
    sound.ensureContext();
    chargeIndicator.show(clientX, clientY);
    disposeChargeAura();
    chargeAura = createChargeAura(scene, glowTexture, target);
  },
  onPressUpdate: (holdMs) => {
    const step = computeChargeStep(holdMs);
    chargeIndicator.setStep(step);
    chargeAura?.setStep(step);
  },
  onPressEnd: ({ target, holdMs }) => {
    chargeIndicator.hide();
    disposeChargeAura();
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
  onStrokeStart: () => {
    // 描画に遷移したら charge UI を撤収して色を確定
    chargeIndicator.hide();
    disposeChargeAura();
    if (cleared) return;
    themePicker.pickAccentColor(strokeColor);
  },
  onStrokeMove: ({ target, prevTarget }) => {
    if (cleared) return;
    residue.stampTrail(
      prevTarget,
      target,
      strokeColor,
      DRAWING_BRUSH_SIZE,
      DRAWING_ALPHA_SCALE,
    );
  },
});

registerServiceWorker();
