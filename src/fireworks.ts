import * as THREE from "three";

const TRAIL_MAX = 40;
const ROCKET_SPEED = 55;

/**
 * 花火の見た目を決めるテーマ設定。
 * createBurst / createRocket にそのまま渡す。
 */
export type BurstTheme = {
  texture: THREE.Texture;
  particleCount: number;
  particleSize: number;
  speedMin: number;
  speedMax: number;
  gravity: number;
  lifetime: number;
  blending: THREE.Blending;
  // パーティクル色の決め方
  coloring:
    | { mode: "uniform"; color: number } // 全粒子同じ色 (絵文字系で使う)
    | {
        mode: "hsl";
        hueMin: number;
        hueMax: number;
        sparkleChance: number; // 白キラキラ粒子の混ざる確率
      };
  // Rocket 本体の色 (省略時はテーマに合わせた白っぽい)
  rocketColor?: number;
};

// ==============================
// Burst (爆発粒子群)
// ==============================

export interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  born: number;
  gravity: number;
  lifetime: number;
  count: number;
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

  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // 球面上に等方向分布
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

    if (theme.coloring.mode === "uniform") {
      color.set(theme.coloring.color);
    } else {
      const c = theme.coloring;
      if (Math.random() < c.sparkleChance) {
        color.setHSL(c.hueMin, 0.3, 0.98);
      } else {
        color.setHSL(
          c.hueMin + Math.random() * (c.hueMax - c.hueMin),
          1.0,
          0.65 + Math.random() * 0.3,
        );
      }
    }
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

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
  };
}

/** @returns true なら寿命切れで削除済み */
export function updateBurst(
  burst: Burst,
  scene: THREE.Scene,
  dt: number,
  now: number,
): boolean {
  const age = now - burst.born;
  const lifeRatio = age / burst.lifetime;

  if (lifeRatio >= 1) {
    scene.remove(burst.points);
    burst.points.geometry.dispose();
    (burst.points.material as THREE.Material).dispose();
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

  const mat = burst.points.material as THREE.PointsMaterial;
  mat.opacity = Math.max(0, 1 - Math.pow(lifeRatio, 2));
  return false;
}

// ==============================
// Rocket (打ち上げ → 目標位置到達で爆発)
// ==============================

export interface Rocket {
  head: THREE.Points;
  trail: THREE.Points;
  trailPositions: Float32Array;
  trailAlphas: Float32Array;
  trailIndex: number;
  position: THREE.Vector3;
  target: THREE.Vector3;
  velocity: THREE.Vector3;
  burstTheme: BurstTheme; // 到達時にこのテーマで爆発
}

export function createRocket(
  scene: THREE.Scene,
  trailTexture: THREE.Texture,
  start: THREE.Vector3,
  target: THREE.Vector3,
  burstTheme: BurstTheme,
): Rocket {
  const rocketColor = burstTheme.rocketColor ?? 0xffaacc;

  // --- head ---
  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([start.x, start.y, start.z]),
      3,
    ),
  );
  const headMat = new THREE.PointsMaterial({
    size: 5.0,
    map: trailTexture,
    color: rocketColor,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const head = new THREE.Points(headGeo, headMat);
  scene.add(head);

  // --- trail (リングバッファ) ---
  const trailPositions = new Float32Array(TRAIL_MAX * 3);
  const trailAlphas = new Float32Array(TRAIL_MAX);
  const trailColors = new Float32Array(TRAIL_MAX * 3);
  const trailColor = new THREE.Color(rocketColor);
  for (let i = 0; i < TRAIL_MAX; i++) {
    trailPositions[i * 3 + 0] = start.x;
    trailPositions[i * 3 + 1] = -9999;
    trailPositions[i * 3 + 2] = start.z;
    trailAlphas[i] = 0;
    trailColors[i * 3 + 0] = trailColor.r;
    trailColors[i * 3 + 1] = trailColor.g;
    trailColors[i * 3 + 2] = trailColor.b;
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(trailPositions, 3),
  );
  trailGeo.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));

  const trailMat = new THREE.PointsMaterial({
    size: 2.8,
    map: trailTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const trail = new THREE.Points(trailGeo, trailMat);
  scene.add(trail);

  const velocity = new THREE.Vector3()
    .subVectors(target, start)
    .normalize()
    .multiplyScalar(ROCKET_SPEED);

  return {
    head,
    trail,
    trailPositions,
    trailAlphas,
    trailIndex: 0,
    position: start.clone(),
    target: target.clone(),
    velocity,
    burstTheme,
  };
}

export function updateRocket(
  rocket: Rocket,
  scene: THREE.Scene,
  dt: number,
): boolean {
  const remaining = rocket.position.distanceTo(rocket.target);
  const step = rocket.velocity.length() * dt;

  if (remaining <= step) {
    scene.remove(rocket.head);
    scene.remove(rocket.trail);
    rocket.head.geometry.dispose();
    (rocket.head.material as THREE.Material).dispose();
    rocket.trail.geometry.dispose();
    (rocket.trail.material as THREE.Material).dispose();
    return true;
  }

  rocket.position.addScaledVector(rocket.velocity, dt);
  const headPos = rocket.head.geometry.attributes.position
    .array as Float32Array;
  headPos[0] = rocket.position.x;
  headPos[1] = rocket.position.y;
  headPos[2] = rocket.position.z;
  rocket.head.geometry.attributes.position.needsUpdate = true;

  const i = rocket.trailIndex;
  rocket.trailPositions[i * 3 + 0] = rocket.position.x + (Math.random() - 0.5);
  rocket.trailPositions[i * 3 + 1] = rocket.position.y - Math.random() * 0.5;
  rocket.trailPositions[i * 3 + 2] = rocket.position.z;
  rocket.trailAlphas[i] = 1.0;
  rocket.trailIndex = (i + 1) % TRAIL_MAX;

  for (let j = 0; j < TRAIL_MAX; j++) {
    rocket.trailAlphas[j] = Math.max(0, rocket.trailAlphas[j] - dt * 2.5);
  }
  rocket.trail.geometry.attributes.position.needsUpdate = true;

  return false;
}
