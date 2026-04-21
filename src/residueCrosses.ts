import * as THREE from "three";
import { RESIDUE_CROSS_MAX, RESIDUE_CROSS_SIZE } from "./config";
import { applySparklePatch, createSeedAttribute } from "./sparkleShader";

/**
 * 焼き付けと同時に spawn する「長寿命の十字 ray 粒子」層。
 *
 * 設計意図:
 *  - 背景 residue は 2D canvas に永続保存されるが、焼き付けた瞬間に形が固定されて
 *    動かない。十字 ray を residue に焼くと「静止した十字」が積み重なって賑やかさが
 *    頭打ちになる。
 *  - そこで十字 ray だけ residue からは外し、寿命を持たない GL 粒子として別レイヤで
 *    維持する。sparkleShader の回転+scalePulse が自動で乗るので、焼き付け完了後も
 *    十字だけは呼吸するようにアニメーションし続ける。
 *
 * 仕組み:
 *  - 固定容量 (RESIDUE_CROSS_MAX) の円環バッファ。addAt で書き込み位置を順繰りに
 *    上書きしていく。古い十字はいずれ上書きで消える。
 *  - seed attribute は 1 度だけ生成して固定。上書き時も seed はそのままなので、
 *    個々のスロットに固有の回転位相/色温度が保たれる (十字が同期しない)。
 *  - material.size は world 単位の固定値。焼き付け半径と違って画面サイズに
 *    追従しないが、十字はあくまで彩りなので厳密一致は不要。
 */
export interface ResidueCrosses {
  /** world 座標 wp に color の十字粒子を 1 つ書き込む (円環バッファ上書き) */
  addAt(wp: THREE.Vector3, color: THREE.Color): void;
  /** 全粒子を非表示化 (色を 0 に)。reset 時に呼ぶ */
  clear(): void;
  dispose(): void;
}

export function createResidueCrosses(
  scene: THREE.Scene,
  crossTexture: THREE.Texture,
): ResidueCrosses {
  const MAX = RESIDUE_CROSS_MAX;

  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  // 初期位置はカメラから大きく外れた無害な場所。color=0 で見えないが、
  // 念のため視界外に置いておく。
  for (let i = 0; i < MAX; i++) {
    positions[i * 3 + 1] = -1e6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("seed", createSeedAttribute(MAX));

  const material = new THREE.PointsMaterial({
    size: RESIDUE_CROSS_SIZE,
    map: crossTexture,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  // 長寿命で画面に留まる粒子なので、短寿命 default より拡縮を強めにして
  // 「呼吸している」感をはっきり出す。0.3 → 0.7..1.3 (60%)。
  // alphaFollowsBrightness=false: ray-only texture の arm が brightness clamp で
  // 消えないよう、map の α をそのまま通す。
  applySparklePatch(material, {
    alphaFollowsBrightness: false,
    scalePulseAmp: 0.3,
    scalePulseHz: 2.0,
  });

  const points = new THREE.Points(geometry, material);
  // addAt で position を動的に書き換える。初期 (0,-1e6,0) のまま
  // BufferGeometry.boundingSphere が固定されると frustum culling で
  // 粒子が丸ごと捨てられるので culling を無効化しておく。
  points.frustumCulled = false;
  // 未書き込みスロットを draw call から除外する。ゲーム開始直後は
  // activeCount が小さいので fragment shader のコストが線形に減る。
  // 円環バッファが 1 周したら MAX で固定される。
  geometry.setDrawRange(0, 0);
  scene.add(points);

  let writeIdx = 0;
  let activeCount = 0;

  function addAt(wp: THREE.Vector3, color: THREE.Color): void {
    const i = writeIdx;
    positions[i * 3 + 0] = wp.x;
    positions[i * 3 + 1] = wp.y;
    positions[i * 3 + 2] = wp.z;
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    writeIdx = (writeIdx + 1) % MAX;
    if (activeCount < MAX) {
      activeCount++;
      geometry.setDrawRange(0, activeCount);
    }
  }

  function clear(): void {
    for (let i = 0; i < MAX; i++) {
      positions[i * 3 + 0] = 0;
      positions[i * 3 + 1] = -1e6;
      positions[i * 3 + 2] = 0;
      colors[i * 3 + 0] = 0;
      colors[i * 3 + 1] = 0;
      colors[i * 3 + 2] = 0;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    writeIdx = 0;
    activeCount = 0;
    geometry.setDrawRange(0, 0);
  }

  function dispose(): void {
    scene.remove(points);
    geometry.dispose();
    material.dispose();
  }

  return { addAt, clear, dispose };
}
