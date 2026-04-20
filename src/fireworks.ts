import * as THREE from "three";

const GRAVITY = -15;
const BURST_LIFETIME = 2.4;
const BURST_PARTICLES = 220;

/** 爆発後に飛び散るパーティクル群 */
export interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  born: number;
}

export function createBurst(
  scene: THREE.Scene,
  texture: THREE.Texture,
  x: number,
  y: number,
  z: number,
  now: number,
): Burst {
  const count = BURST_PARTICLES;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  // 花火全体は同系色でまとまりを出す
  const baseHue = Math.random();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // 球面上に等方向分布(方向 + 可変スピード)
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 8 + Math.random() * 8;

    velocities[i * 3 + 0] = speed * Math.sin(phi) * Math.cos(theta);
    velocities[i * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta);
    velocities[i * 3 + 2] = speed * Math.cos(phi);

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    color.setHSL(
      (baseHue + (Math.random() - 0.5) * 0.08) % 1,
      0.95,
      0.55 + Math.random() * 0.35,
    );
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.4,
    map: texture,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  return { points, velocities, born: now };
}

/** @returns true なら寿命切れで削除済み */
export function updateBurst(
  burst: Burst,
  scene: THREE.Scene,
  dt: number,
  now: number,
): boolean {
  const age = now - burst.born;
  const lifeRatio = age / BURST_LIFETIME;

  if (lifeRatio >= 1) {
    scene.remove(burst.points);
    burst.points.geometry.dispose();
    (burst.points.material as THREE.Material).dispose();
    return true;
  }

  const positions = burst.points.geometry.attributes.position
    .array as Float32Array;
  const velocities = burst.velocities;

  for (let i = 0; i < BURST_PARTICLES; i++) {
    velocities[i * 3 + 1] += GRAVITY * dt;
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

const ROCKET_SPEED = 55; // ワールド単位/秒
const TRAIL_MAX = 40; // リングバッファで使う最大粒子数

export interface Rocket {
  head: THREE.Points; // 先頭の明るい点 (単一パーティクル)
  trail: THREE.Points; // 尾を引く粒子群 (リングバッファ)
  trailPositions: Float32Array;
  trailAlphas: Float32Array;
  trailIndex: number; // 次に書き込む位置
  position: THREE.Vector3;
  target: THREE.Vector3;
  velocity: THREE.Vector3;
}

export function createRocket(
  scene: THREE.Scene,
  texture: THREE.Texture,
  start: THREE.Vector3,
  target: THREE.Vector3,
): Rocket {
  // --- head (明るい点1つ) ---
  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([start.x, start.y, start.z]),
      3,
    ),
  );
  const headMat = new THREE.PointsMaterial({
    size: 1.8,
    map: texture,
    color: 0xfff2a8,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const head = new THREE.Points(headGeo, headMat);
  scene.add(head);

  // --- trail (リングバッファ) ---
  // TRAIL_MAX 個の粒子の position と alpha を管理し、古いものから上書き
  const trailPositions = new Float32Array(TRAIL_MAX * 3);
  const trailAlphas = new Float32Array(TRAIL_MAX);
  const trailColors = new Float32Array(TRAIL_MAX * 3);
  for (let i = 0; i < TRAIL_MAX; i++) {
    trailPositions[i * 3 + 0] = start.x;
    trailPositions[i * 3 + 1] = -9999; // 画面外に退避
    trailPositions[i * 3 + 2] = start.z;
    trailAlphas[i] = 0;
    // 黄〜橙の火花色
    trailColors[i * 3 + 0] = 1.0;
    trailColors[i * 3 + 1] = 0.7;
    trailColors[i * 3 + 2] = 0.2;
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(trailPositions, 3),
  );
  trailGeo.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));

  const trailMat = new THREE.PointsMaterial({
    size: 1.0,
    map: texture,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const trail = new THREE.Points(trailGeo, trailMat);
  scene.add(trail);

  // 速度 = targetへの方向ベクトル × 固定スピード
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
  };
}

/**
 * @returns true ならtargetに到達 (呼び出し側で爆発を起こす)
 */
export function updateRocket(
  rocket: Rocket,
  scene: THREE.Scene,
  dt: number,
): boolean {
  // 残り距離が1フレーム進む距離以下になったら到達
  const remaining = rocket.position.distanceTo(rocket.target);
  const step = rocket.velocity.length() * dt;

  if (remaining <= step) {
    // 到達: リソース解放
    scene.remove(rocket.head);
    scene.remove(rocket.trail);
    rocket.head.geometry.dispose();
    (rocket.head.material as THREE.Material).dispose();
    rocket.trail.geometry.dispose();
    (rocket.trail.material as THREE.Material).dispose();
    return true;
  }

  // 位置更新
  rocket.position.addScaledVector(rocket.velocity, dt);
  const headPos = rocket.head.geometry.attributes.position
    .array as Float32Array;
  headPos[0] = rocket.position.x;
  headPos[1] = rocket.position.y;
  headPos[2] = rocket.position.z;
  rocket.head.geometry.attributes.position.needsUpdate = true;

  // 尾を追加 (リングバッファに新しい粒子を書き込み)
  const i = rocket.trailIndex;
  rocket.trailPositions[i * 3 + 0] = rocket.position.x + (Math.random() - 0.5);
  rocket.trailPositions[i * 3 + 1] = rocket.position.y - Math.random() * 0.5;
  rocket.trailPositions[i * 3 + 2] = rocket.position.z;
  rocket.trailAlphas[i] = 1.0;
  rocket.trailIndex = (i + 1) % TRAIL_MAX;

  // 全尾粒子をフェード
  for (let j = 0; j < TRAIL_MAX; j++) {
    rocket.trailAlphas[j] = Math.max(0, rocket.trailAlphas[j] - dt * 2.5);
  }
  rocket.trail.geometry.attributes.position.needsUpdate = true;

  return false;
}
