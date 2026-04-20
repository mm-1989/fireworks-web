import * as THREE from "three";
import {
  ROCKET_DEFAULT_COLOR,
  ROCKET_HEAD_SIZE,
  ROCKET_SPEED,
  ROCKET_TRAIL_FADE_PER_SEC,
  ROCKET_TRAIL_MAX,
  ROCKET_TRAIL_SIZE,
} from "./config";
import type { BurstTheme } from "./themes";

/**
 * 打ち上げ花火。head (先端) と trail (残像) の 2 つの Points からなる。
 * trail はリングバッファで古い点を上書きし、alpha をフレームごとに減衰させる。
 */
export interface Rocket {
  head: THREE.Points;
  trail: THREE.Points;
  trailPositions: Float32Array;
  trailColors: Float32Array;
  trailAlphas: Float32Array;
  trailBaseColor: THREE.Color;
  trailIndex: number;
  position: THREE.Vector3;
  target: THREE.Vector3;
  velocity: THREE.Vector3;
  burstTheme: BurstTheme;
}

export function createRocket(
  scene: THREE.Scene,
  trailTexture: THREE.Texture,
  start: THREE.Vector3,
  target: THREE.Vector3,
  burstTheme: BurstTheme,
): Rocket {
  const rocketColor = burstTheme.rocketColor ?? ROCKET_DEFAULT_COLOR;
  const head = createHead(scene, trailTexture, rocketColor, start);
  const trailState = createTrail(scene, trailTexture, rocketColor, start);

  const velocity = new THREE.Vector3()
    .subVectors(target, start)
    .normalize()
    .multiplyScalar(ROCKET_SPEED);

  return {
    head,
    trail: trailState.points,
    trailPositions: trailState.positions,
    trailColors: trailState.colors,
    trailAlphas: trailState.alphas,
    trailBaseColor: trailState.baseColor,
    trailIndex: 0,
    position: start.clone(),
    target: target.clone(),
    velocity,
    burstTheme,
  };
}

/** @returns true なら目標到達で削除済み */
export function updateRocket(
  rocket: Rocket,
  scene: THREE.Scene,
  dt: number,
): boolean {
  const remaining = rocket.position.distanceTo(rocket.target);
  const step = rocket.velocity.length() * dt;

  if (remaining <= step) {
    disposeRocket(rocket, scene);
    return true;
  }

  rocket.position.addScaledVector(rocket.velocity, dt);
  updateHeadPosition(rocket);
  spawnTrailPoint(rocket);
  fadeTrail(rocket, dt);
  return false;
}

// ---- internals ----

interface TrailState {
  points: THREE.Points;
  positions: Float32Array;
  colors: Float32Array;
  alphas: Float32Array;
  baseColor: THREE.Color;
}

function createHead(
  scene: THREE.Scene,
  texture: THREE.Texture,
  color: number,
  start: THREE.Vector3,
): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([start.x, start.y, start.z]),
      3,
    ),
  );
  const mat = new THREE.PointsMaterial({
    size: ROCKET_HEAD_SIZE,
    map: texture,
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const head = new THREE.Points(geo, mat);
  scene.add(head);
  return head;
}

function createTrail(
  scene: THREE.Scene,
  texture: THREE.Texture,
  color: number,
  start: THREE.Vector3,
): TrailState {
  const positions = new Float32Array(ROCKET_TRAIL_MAX * 3);
  const colors = new Float32Array(ROCKET_TRAIL_MAX * 3);
  const alphas = new Float32Array(ROCKET_TRAIL_MAX);
  const baseColor = new THREE.Color(color);

  // 初期は alpha=0 なので色は (0,0,0) で OK。位置は画面外に退避し、最初のフレームで描画されないようにする
  for (let i = 0; i < ROCKET_TRAIL_MAX; i++) {
    positions[i * 3 + 0] = start.x;
    positions[i * 3 + 1] = -9999;
    positions[i * 3 + 2] = start.z;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: ROCKET_TRAIL_SIZE,
    map: texture,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, positions, colors, alphas, baseColor };
}

function updateHeadPosition(rocket: Rocket): void {
  const headPos = rocket.head.geometry.attributes.position
    .array as Float32Array;
  headPos[0] = rocket.position.x;
  headPos[1] = rocket.position.y;
  headPos[2] = rocket.position.z;
  rocket.head.geometry.attributes.position.needsUpdate = true;
}

function spawnTrailPoint(rocket: Rocket): void {
  const i = rocket.trailIndex;
  // わずかにランダム方向へズラすと火の粉が拡散する残像に見える
  rocket.trailPositions[i * 3 + 0] = rocket.position.x + (Math.random() - 0.5);
  rocket.trailPositions[i * 3 + 1] = rocket.position.y - Math.random() * 0.5;
  rocket.trailPositions[i * 3 + 2] = rocket.position.z;
  rocket.trailAlphas[i] = 1.0;
  rocket.trailIndex = (i + 1) % ROCKET_TRAIL_MAX;
}

/**
 * alpha を時間で減衰し、ベース色に掛け合わせて color 属性へ反映する。
 * PointsMaterial の vertexColors は alpha を見ないため、RGB をスケールすることで
 * AdditiveBlending 下でも期待通りに消えていく。
 */
function fadeTrail(rocket: Rocket, dt: number): void {
  const decay = ROCKET_TRAIL_FADE_PER_SEC * dt;
  const { trailAlphas, trailColors, trailBaseColor } = rocket;
  for (let j = 0; j < ROCKET_TRAIL_MAX; j++) {
    const a = Math.max(0, trailAlphas[j] - decay);
    trailAlphas[j] = a;
    trailColors[j * 3 + 0] = trailBaseColor.r * a;
    trailColors[j * 3 + 1] = trailBaseColor.g * a;
    trailColors[j * 3 + 2] = trailBaseColor.b * a;
  }
  rocket.trail.geometry.attributes.position.needsUpdate = true;
  rocket.trail.geometry.attributes.color.needsUpdate = true;
}

function disposeRocket(rocket: Rocket, scene: THREE.Scene): void {
  scene.remove(rocket.head);
  scene.remove(rocket.trail);
  rocket.head.geometry.dispose();
  (rocket.head.material as THREE.Material).dispose();
  rocket.trail.geometry.dispose();
  (rocket.trail.material as THREE.Material).dispose();
}
