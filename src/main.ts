import * as THREE from "three";
import "./style.css";

// ==============================
// Scene / Camera / Renderer
// ==============================
const canvas = document.getElementById("scene") as HTMLCanvasElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000010);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 0, 50);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// ==============================
// 花火パーティクル = 1発の爆発
// ==============================
const PARTICLES_PER_BURST = 180;
const GRAVITY = -15; // y方向の落下加速度
const LIFETIME = 2.2; // 秒

interface Burst {
  points: THREE.Points;
  velocities: Float32Array; // x,y,z × particleCount
  born: number; // 生成時刻(秒)
}

const bursts: Burst[] = [];

function createBurst(worldX: number, worldY: number, worldZ: number): Burst {
  const count = PARTICLES_PER_BURST;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  // 花火全体の色相をランダムに1つ決め、同系色で統一
  const baseHue = Math.random();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // 球状に等方向発射 → 自然な爆発形状
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 8 + Math.random() * 6;

    const vx = speed * Math.sin(phi) * Math.cos(theta);
    const vy = speed * Math.sin(phi) * Math.sin(theta);
    const vz = speed * Math.cos(phi);

    positions[i * 3 + 0] = worldX;
    positions[i * 3 + 1] = worldY;
    positions[i * 3 + 2] = worldZ;

    velocities[i * 3 + 0] = vx;
    velocities[i * 3 + 1] = vy;
    velocities[i * 3 + 2] = vz;

    // 色相は同系、彩度/明度をランダムで「火の粉」感を出す
    color.setHSL(
      (baseHue + (Math.random() - 0.5) * 0.1) % 1,
      0.9,
      0.5 + Math.random() * 0.4,
    );
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.6,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending, // 光の重なりで明るく見える
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  return { points, velocities, born: clock.getElapsedTime() };
}

// ==============================
// 毎フレーム更新
// ==============================
const clock = new THREE.Clock();

function animate() {
  const now = clock.getElapsedTime();
  const dt = clock.getDelta();

  for (let b = bursts.length - 1; b >= 0; b--) {
    const burst = bursts[b];
    const age = now - burst.born;
    const lifeRatio = age / LIFETIME;

    if (lifeRatio >= 1) {
      // 寿命終了 → シーンから削除してメモリ解放
      scene.remove(burst.points);
      burst.points.geometry.dispose();
      (burst.points.material as THREE.Material).dispose();
      bursts.splice(b, 1);
      continue;
    }

    const positions = burst.points.geometry.attributes.position
      .array as Float32Array;
    const velocities = burst.velocities;

    // 速度積分 + 重力
    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      velocities[i * 3 + 1] += GRAVITY * dt;
      positions[i * 3 + 0] += velocities[i * 3 + 0] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
    }
    burst.points.geometry.attributes.position.needsUpdate = true;

    // フェードアウト (後半で急速に消える)
    const material = burst.points.material as THREE.PointsMaterial;
    material.opacity = Math.max(0, 1 - Math.pow(lifeRatio, 2));
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// ==============================
// タップ/クリック → 花火
// ==============================
// 画面座標 (px) を z=0 平面上のワールド座標に変換
function screenToWorld(clientX: number, clientY: number): THREE.Vector3 {
  const ndc = new THREE.Vector2(
    (clientX / window.innerWidth) * 2 - 1,
    -((clientY / window.innerHeight) * 2 - 1),
  );
  const vec = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera);
  const dir = vec.sub(camera.position).normalize();
  const distance = -camera.position.z / dir.z;
  return camera.position.clone().add(dir.multiplyScalar(distance));
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const pos = screenToWorld(e.clientX, e.clientY);
  bursts.push(createBurst(pos.x, pos.y, pos.z));
});

// ==============================
// リサイズ対応
// ==============================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
