import * as THREE from "three";
import { STAMP_LIFE_RATIO } from "./config";
import { applySparklePatch, createSeedAttribute } from "./sparkleShader";
import type { BurstTheme } from "./themes";

/**
 * 爆発時の粒子群。
 *
 * 位置計算は頂点シェーダで実行する (GPU 積分)。JS 側は velocities と origin だけ保持し、
 * stamp 時に JS 側で同じ式を評価して現在位置を得る (computeBurstPositions)。
 * これにより毎フレームの for ループと position バッファの GPU 再アップロードを廃止。
 */
export interface Burst {
  points: THREE.Points;
  /** 各粒子の初速。(count*3) floats。GPU attribute にもセット済み */
  velocities: Float32Array;
  /** 爆発原点。GPU では attribute position (全要素同値) に入っている */
  origin: THREE.Vector3;
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
  geometry.setAttribute("aVelocity", new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute("seed", createSeedAttribute(count));

  const material = new THREE.PointsMaterial({
    size: theme.particleSize,
    map: theme.texture,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    blending: theme.blending,
    depthWrite: false,
  });
  // GPU 積分パッチ → sparkle パッチの順で適用。sparkle 側が onBeforeCompile を
  // chain 構造で連結するため、先に設定したパッチは prior として呼ばれる。
  applyBurstIntegrationPatch(material, now, theme.gravity);
  applySparklePatch(material);

  const points = new THREE.Points(geometry, material);
  // 頂点シェーダで実位置を動かすため、BufferGeometry.boundingSphere は origin 1 点を
  // 指したままで実際の描画範囲と一致しない。frustum culling を切らないと
  // 広がった粒子がカメラ外判定で落とされる。
  points.frustumCulled = false;
  scene.add(points);

  return {
    points,
    velocities,
    origin: new THREE.Vector3(x, y, z),
    born: now,
    gravity: theme.gravity,
    lifetime: theme.lifetime,
    count,
    stamped: false,
  };
}

/**
 * @param onStampReady burst の寿命比率が STAMP_LIFE_RATIO を跨いだフレームで 1 回だけ呼ばれる。
 *                    残留レイヤへの焼き付けなどに使う。`now` は残留側の位置再計算に使う
 * @returns true なら寿命切れで削除済み
 */
export function updateBurst(
  burst: Burst,
  scene: THREE.Scene,
  _dt: number,
  now: number,
  onStampReady?: (burst: Burst, now: number) => void,
): boolean {
  const age = now - burst.born;
  const lifeRatio = age / burst.lifetime;

  if (!burst.stamped && lifeRatio >= STAMP_LIFE_RATIO) {
    burst.stamped = true;
    onStampReady?.(burst, now);
  }

  if (lifeRatio >= 1) {
    disposeBurst(burst, scene);
    return true;
  }

  // 位置積分は頂点シェーダで実行 (sparkleUniforms.uTime + uBornTime)。
  // JS 側は寿命に応じた不透明度の減衰のみ行う。
  const mat = burst.points.material as THREE.PointsMaterial;
  mat.opacity = Math.max(0, 1 - lifeRatio * lifeRatio);
  return false;
}

/**
 * JS 側で現在位置を計算する。GPU シェーダと同じ式なので結果が一致する。
 * stamp / force-stamp 時に consumer (residue の焼き付け, residueCrosses の spawn) から
 * 呼び出される。burst あたり 1 度だけ評価するので for ループが残っていても軽い。
 */
export function computeBurstPositions(
  burst: Burst,
  now: number,
  out?: Float32Array,
): Float32Array {
  const t = now - burst.born;
  const count = burst.count;
  const positions = out ?? new Float32Array(count * 3);
  const vel = burst.velocities;
  const ox = burst.origin.x;
  const oy = burst.origin.y;
  const oz = burst.origin.z;
  const halfGt2 = 0.5 * burst.gravity * t * t;
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = ox + vel[i * 3 + 0] * t;
    positions[i * 3 + 1] = oy + vel[i * 3 + 1] * t + halfGt2;
    positions[i * 3 + 2] = oz + vel[i * 3 + 2] * t;
  }
  return positions;
}

/** burst の GPU リソースを解放しシーンから取り除く */
export function disposeBurst(burst: Burst, scene: THREE.Scene): void {
  scene.remove(burst.points);
  burst.points.geometry.dispose();
  (burst.points.material as THREE.Material).dispose();
}

/**
 * PointsMaterial の頂点シェーダに burst 積分を注入する。JS で毎フレーム position を
 * 書き戻す代わりに、GPU が以下の analytic 式で現在位置を計算する:
 *
 *   transformed = origin + aVelocity * t + 0.5 * g * t^2 * yhat
 *   t = uTime - uBornTime
 *
 * 前提:
 *  - geometry に `aVelocity` (vec3) と `position` (= origin, 全頂点同値) が設定済
 *  - uTime は sparkleUniforms 経由で animate ループが毎フレーム更新する
 *  - uBornTime / uGravity は material ごとに固定 (burst 生成時に確定)
 *
 * 呼び出し順序: applySparklePatch より先に呼ぶこと。sparkle 側が onBeforeCompile を
 * prior として chain するため、先に設定したパッチが先に実行される。
 */
function applyBurstIntegrationPatch(
  material: THREE.PointsMaterial,
  bornTime: number,
  gravity: number,
): void {
  const bornUniform = { value: bornTime };
  const gravityUniform = { value: gravity };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBornTime = bornUniform;
    shader.uniforms.uGravity = gravityUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        `attribute vec3 aVelocity;
uniform float uBornTime;
uniform float uGravity;
uniform float uTime;
void main() {`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float tBurst = uTime - uBornTime;
transformed = position + aVelocity * tBurst + vec3(0.0, uGravity * 0.5 * tBurst * tBurst, 0.0);`,
      );
  };
  // Three.js デフォルトの customProgramCacheKey は onBeforeCompile.toString() だが、
  // applySparklePatch の wrapper 関数が全 sparkle 材料で同一本体なため、
  // burst 積分パッチ入りの program が他 (chargeAura 等) とキャッシュ共有され
  // begin_vertex 置換が効かなくなる。burst 固有キーで分離する。
  material.customProgramCacheKey = () => "burst-integration-v1";
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
  const c = theme.coloring;
  const range = c.hueRanges[Math.floor(Math.random() * c.hueRanges.length)];
  if (Math.random() < c.sparkleChance) {
    target.setHSL(range.hueMin, 0.3, 0.98);
  } else {
    target.setHSL(
      range.hueMin + Math.random() * (range.hueMax - range.hueMin),
      1.0,
      0.65 + Math.random() * 0.3,
    );
  }
}
