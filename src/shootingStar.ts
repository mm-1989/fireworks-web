import * as THREE from "three";
import {
  SHOOTING_STAR_HEAD_SIZE,
  SHOOTING_STAR_LIFETIME,
  SHOOTING_STAR_STAMP_WORLD_SIZE,
  SHOOTING_STAR_TRAIL_FADE_PER_SEC,
  SHOOTING_STAR_TRAIL_MAX,
  SHOOTING_STAR_TRAIL_SIZE,
} from "./config";
import { applySparklePatch, createSeedAttribute } from "./sparkleShader";

/**
 * スワイプで発射される流れ星。
 * head (先端の明るい粒) と trail (残像リングバッファ) の 2 つの Points から成る。
 * rocket.ts と実装パターンはほぼ同じだが、目標座標ではなく「寿命と速度ベクトル」で終端する。
 *
 * residue への焼き付けは毎フレーム head 位置を 1 回。軌跡そのまま線状に残る。
 */
export interface ShootingStar {
  head: THREE.Points;
  trail: THREE.Points;
  trailPositions: Float32Array;
  trailColors: Float32Array;
  trailAlphas: Float32Array;
  trailBaseColor: THREE.Color;
  trailIndex: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  born: number;
  lifetime: number;
}

export function createShootingStar(
  scene: THREE.Scene,
  texture: THREE.Texture,
  start: THREE.Vector3,
  velocity: THREE.Vector3,
  color: THREE.Color,
  now: number,
): ShootingStar {
  const head = createHead(scene, texture, color, start);
  const trailState = createTrail(scene, texture, color, start);

  return {
    head,
    trail: trailState.points,
    trailPositions: trailState.positions,
    trailColors: trailState.colors,
    trailAlphas: trailState.alphas,
    trailBaseColor: trailState.baseColor,
    trailIndex: 0,
    position: start.clone(),
    velocity: velocity.clone(),
    color: color.clone(),
    born: now,
    lifetime: SHOOTING_STAR_LIFETIME,
  };
}

/**
 * @param onStamp 毎フレーム head 位置で呼ばれる。residue への焼き付けに使う
 * @returns true なら寿命切れで削除済み
 */
export function updateShootingStar(
  star: ShootingStar,
  scene: THREE.Scene,
  dt: number,
  now: number,
  onStamp?: (pos: THREE.Vector3, color: THREE.Color, size: number) => void,
): boolean {
  const age = now - star.born;
  const lifeRatio = age / star.lifetime;
  if (lifeRatio >= 1) {
    disposeShootingStar(star, scene);
    return true;
  }

  star.position.addScaledVector(star.velocity, dt);
  updateHeadPosition(star);
  updateHeadOpacity(star, lifeRatio);
  spawnTrailPoint(star);
  fadeTrail(star, dt);
  onStamp?.(star.position, star.color, SHOOTING_STAR_STAMP_WORLD_SIZE);
  return false;
}

export function disposeShootingStar(
  star: ShootingStar,
  scene: THREE.Scene,
): void {
  scene.remove(star.head);
  scene.remove(star.trail);
  star.head.geometry.dispose();
  (star.head.material as THREE.Material).dispose();
  star.trail.geometry.dispose();
  (star.trail.material as THREE.Material).dispose();
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
  color: THREE.Color,
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
  geo.setAttribute("seed", createSeedAttribute(1));
  const mat = new THREE.PointsMaterial({
    size: SHOOTING_STAR_HEAD_SIZE,
    map: texture,
    color: color.clone(),
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  applySparklePatch(mat);
  const head = new THREE.Points(geo, mat);
  scene.add(head);
  return head;
}

function createTrail(
  scene: THREE.Scene,
  texture: THREE.Texture,
  color: THREE.Color,
  start: THREE.Vector3,
): TrailState {
  const positions = new Float32Array(SHOOTING_STAR_TRAIL_MAX * 3);
  const colors = new Float32Array(SHOOTING_STAR_TRAIL_MAX * 3);
  const alphas = new Float32Array(SHOOTING_STAR_TRAIL_MAX);
  const baseColor = color.clone();

  for (let i = 0; i < SHOOTING_STAR_TRAIL_MAX; i++) {
    positions[i * 3 + 0] = start.x;
    positions[i * 3 + 1] = -9999;
    positions[i * 3 + 2] = start.z;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("seed", createSeedAttribute(SHOOTING_STAR_TRAIL_MAX));

  const mat = new THREE.PointsMaterial({
    size: SHOOTING_STAR_TRAIL_SIZE,
    map: texture,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  // trail は vertex color が 0 まで落ちる。sparkle パッチ内で alpha が
  // max(tinted.rgb) に追従するため、フェード時に黒飛びは起きない。
  applySparklePatch(mat);
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, positions, colors, alphas, baseColor };
}

function updateHeadPosition(star: ShootingStar): void {
  const headPos = star.head.geometry.attributes.position.array as Float32Array;
  headPos[0] = star.position.x;
  headPos[1] = star.position.y;
  headPos[2] = star.position.z;
  star.head.geometry.attributes.position.needsUpdate = true;
}

/** 寿命の後半で head を急速に消す (花火らしい消え方) */
function updateHeadOpacity(star: ShootingStar, lifeRatio: number): void {
  const mat = star.head.material as THREE.PointsMaterial;
  mat.opacity = Math.max(0, 1 - lifeRatio * lifeRatio);
}

function spawnTrailPoint(star: ShootingStar): void {
  const i = star.trailIndex;
  star.trailPositions[i * 3 + 0] = star.position.x + (Math.random() - 0.5) * 0.4;
  star.trailPositions[i * 3 + 1] = star.position.y + (Math.random() - 0.5) * 0.4;
  star.trailPositions[i * 3 + 2] = star.position.z;
  star.trailAlphas[i] = 1.0;
  star.trailIndex = (i + 1) % SHOOTING_STAR_TRAIL_MAX;
}

function fadeTrail(star: ShootingStar, dt: number): void {
  const decay = SHOOTING_STAR_TRAIL_FADE_PER_SEC * dt;
  const { trailAlphas, trailColors, trailBaseColor } = star;
  for (let j = 0; j < SHOOTING_STAR_TRAIL_MAX; j++) {
    const a = Math.max(0, trailAlphas[j] - decay);
    trailAlphas[j] = a;
    trailColors[j * 3 + 0] = trailBaseColor.r * a;
    trailColors[j * 3 + 1] = trailBaseColor.g * a;
    trailColors[j * 3 + 2] = trailBaseColor.b * a;
  }
  star.trail.geometry.attributes.position.needsUpdate = true;
  star.trail.geometry.attributes.color.needsUpdate = true;
}
