import * as THREE from "three";
import "./style.css";
import { SoundManager } from "./audio";
import { type Burst, createBurst, updateBurst } from "./burst";
import {
  ROCKET_LAUNCH_Y_OFFSET,
  DT_MAX,
} from "./config";
import { mountDebugBadge } from "./debugBadge";
import { createGlowTexture } from "./glowTexture";
import { bindPointerLaunch } from "./input";
import { detectPerformanceTier } from "./performanceTier";
import { type Rocket, createRocket, updateRocket } from "./rocket";
import { createSceneContext } from "./scene";
import { registerServiceWorker } from "./serviceWorker";
import { createThemePicker } from "./themes";

const canvas = document.getElementById("scene");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Expected <canvas id="scene"> in index.html');
}

const { scene, camera, renderer } = createSceneContext(canvas);
const glowTexture = createGlowTexture();
const sound = new SoundManager();
const perf = detectPerformanceTier();
const themePicker = createThemePicker(glowTexture, perf);

mountDebugBadge(perf);

const bursts: Burst[] = [];
const rockets: Rocket[] = [];
const clock = new THREE.Clock();

function animate(): void {
  // 注意: clock.getDelta() を先に呼ぶこと。getElapsedTime() は内部で getDelta() を
  //       呼び時計を進めるため、先に elapsed を取ると後続の getDelta() は ≒0 になる。
  const dt = Math.min(clock.getDelta(), DT_MAX);
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

bindPointerLaunch(canvas, camera, ({ target, launchFloor }) => {
  sound.ensureContext();
  const start = new THREE.Vector3(
    target.x,
    launchFloor.y - ROCKET_LAUNCH_Y_OFFSET,
    target.z,
  );
  const theme = themePicker.pick();
  rockets.push(createRocket(scene, glowTexture, start, target, theme));
  sound.playLaunch();
});

registerServiceWorker();
