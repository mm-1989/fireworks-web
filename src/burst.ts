import * as THREE from "three";
import { STAMP_LIFE_RATIO } from "./config";
import type { BurstTheme } from "./themes";

/**
 * 爆発時の粒子群。
 * BufferGeometry の position 属性と並列な velocities 配列を毎フレーム積分する。
 */
export interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  born: number;
  gravity: number;
  lifetime: number;
  count: number;
  /** 焼き付け済みフラグ。STAMP_LIFE_RATIO を跨いだ 1 フレームだけ true になる直前に検知 */
  stamped: boolean;
}

export function createBurst(
  scene: THREE.Scene,
  theme: BurstTheme,
  x: number,
  y: number,
  z: number,
  now: number,
): Burst {
  const count = theme.particleCount;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  fillInitialState(positions, velocities, colors, theme, x, y, z);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: theme.particleSize,
    map: theme.texture,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    blending: theme.blending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  return {
    points,
    velocities,
    born: now,
    gravity: theme.gravity,
    lifetime: theme.lifetime,
    count,
    stamped: false,
  };
}

/**
 * @param onStampReady burst の寿命比率が STAMP_LIFE_RATIO を跨いだフレームで 1 回だけ呼ばれる。
 *                    残留レイヤへの焼き付けなどに使う
 * @returns true なら寿命切れで削除済み
 */
export function updateBurst(
  burst: Burst,
  scene: THREE.Scene,
  dt: number,
  now: number,
  onStampReady?: (burst: Burst) => void,
): boolean {
  const age = now - burst.born;
  const lifeRatio = age / burst.lifetime;

  if (!burst.stamped && lifeRatio >= STAMP_LIFE_RATIO) {
    burst.stamped = true;
    onStampReady?.(burst);
  }

  if (lifeRatio >= 1) {
    disposeBurst(burst, scene);
    return true;
  }

  const positions = burst.points.geometry.attributes.position
    .array as Float32Array;
  const velocities = burst.velocities;

  for (let i = 0; i < burst.count; i++) {
    velocities[i * 3 + 1] += burst.gravity * dt;
    positions[i * 3 + 0] += velocities[i * 3 + 0] * dt;
    positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
    positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
  }
  burst.points.geometry.attributes.position.needsUpdate = true;

  // 寿命の二次関数で不透明度を減衰 (最後の方で一気に消える方が花火らしい)
  const mat = burst.points.material as THREE.PointsMaterial;
  mat.opacity = Math.max(0, 1 - lifeRatio * lifeRatio);
  return false;
}

/** burst の GPU リソースを解放しシーンから取り除く */
export function disposeBurst(burst: Burst, scene: THREE.Scene): void {
  scene.remove(burst.points);
  burst.points.geometry.dispose();
  (burst.points.material as THREE.Material).dispose();
}

function fillInitialState(
  positions: Float32Array,
  velocities: Float32Array,
  colors: Float32Array,
  theme: BurstTheme,
  x: number,
  y: number,
  z: number,
): void {
  const count = theme.particleCount;
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // 球面上に等方分布
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed =
      theme.speedMin + Math.random() * (theme.speedMax - theme.speedMin);

    velocities[i * 3 + 0] = speed * Math.sin(phi) * Math.cos(theta);
    velocities[i * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
    velocities[i * 3 + 2] = speed * Math.cos(phi);

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    resolveParticleColor(color, theme);
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
}

function resolveParticleColor(target: THREE.Color, theme: BurstTheme): void {
  if (theme.coloring.mode === "uniform") {
    target.set(theme.coloring.color);
    return;
  }
  const c = theme.coloring;
  if (Math.random() < c.sparkleChance) {
    target.setHSL(c.hueMin, 0.3, 0.98);
  } else {
    target.setHSL(
      c.hueMin + Math.random() * (c.hueMax - c.hueMin),
      1.0,
      0.65 + Math.random() * 0.3,
    );
  }
}
