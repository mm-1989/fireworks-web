import * as THREE from "three";
import {
  CHARGE_AURA_MAX,
  CHARGE_AURA_OUTER_R,
  CHARGE_AURA_OUTER_R_JITTER,
  CHARGE_MAX_STEPS,
} from "./config";
import { applySparklePatch, createSeedAttribute } from "./sparkleShader";

/**
 * 長押し中に押下位置を中心として 3D 粒子が螺旋を描いて吸い込まれていく演出。
 * 段階 (0..CHARGE_MAX_STEPS) が上がるほど密度・渦速度・吸込み速度・粒子サイズ・
 * 不透明度が増す。burst 本体とは独立して動き、pointerup で dispose する。
 *
 * 実装メモ:
 *  - 各粒子は (radius, angle) の極座標を持ち、angular/inward 速度を持つ。
 *  - inner radius 未満になった粒子は outer リングに即 respawn → 常時フロー継続。
 *  - sparkle patch を通すので、既存粒子と同じキラキラ/回転/gradient が乗る。
 *  - center はコンストラクタで固定 (pointerdown 時のワールド座標)。ちょい動きは
 *    無視 (CHARGE_MOVE_CANCEL_PX を超えたら swipe に遷移して aura は破棄)。
 */
export interface ChargeAura {
  setStep(step: number): void;
  update(dt: number): void;
  dispose(): void;
}

export function createChargeAura(
  scene: THREE.Scene,
  texture: THREE.Texture,
  center: THREE.Vector3,
): ChargeAura {
  const MAX = CHARGE_AURA_MAX;
  const INNER_R = 0.4;

  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const radiuses = new Float32Array(MAX);
  const angles = new Float32Array(MAX);
  const angularSpeeds = new Float32Array(MAX);
  const inwardBase = new Float32Array(MAX);

  const tmpColor = new THREE.Color();

  for (let i = 0; i < MAX; i++) {
    radiuses[i] = CHARGE_AURA_OUTER_R + Math.random() * CHARGE_AURA_OUTER_R_JITTER;
    angles[i] = Math.random() * Math.PI * 2;
    // CW/CCW をばらし、スピードも散らす
    angularSpeeds[i] = (1.2 + Math.random() * 2.0) * (Math.random() < 0.5 ? -1 : 1);
    inwardBase[i] = 1.2 + Math.random() * 1.4;
    pickChargeColor(tmpColor, 0);
    colors[i * 3 + 0] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;

    positions[i * 3 + 0] = center.x + Math.cos(angles[i]) * radiuses[i];
    positions[i * 3 + 1] = center.y + Math.sin(angles[i]) * radiuses[i];
    positions[i * 3 + 2] = center.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("seed", createSeedAttribute(MAX));

  const material = new THREE.PointsMaterial({
    size: 0.6,
    map: texture,
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  applySparklePatch(material);

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // 中心に置く「コア」。step が上がるほど明るく大きくなり、MAX で脈動する。
  // 粒子群が渦の収束点に落ちていく先を視覚化し、満チャージを分かりやすく伝える。
  const corePositions = new Float32Array([center.x, center.y, center.z]);
  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute("position", new THREE.BufferAttribute(corePositions, 3));
  coreGeo.setAttribute("seed", createSeedAttribute(1));
  const coreMat = new THREE.PointsMaterial({
    size: 0.5,
    map: texture,
    color: new THREE.Color(1, 1, 1),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  applySparklePatch(coreMat);
  const core = new THREE.Points(coreGeo, coreMat);
  scene.add(core);

  let currentStep = 0;
  let elapsed = 0;

  function update(dt: number): void {
    elapsed += dt;
    const t = Math.min(1, currentStep / CHARGE_MAX_STEPS);
    const swirl = 0.5 + t * 1.8;
    const inward = 0.25 + t * 1.9;

    // 段階が変わる度に粒子を刷新すると不自然なので、毎フレーム少数だけ
    // 段階の新パレットで塗り直す (高段階ほど多く)。満チャージ付近で虹色に。
    const repaintCount = Math.max(
      0,
      Math.floor(MAX * (t * 0.35 + t * t * 0.65) * dt),
    );
    for (let k = 0; k < repaintCount; k++) {
      const i = Math.floor(Math.random() * MAX);
      pickChargeColor(tmpColor, t);
      colors[i * 3 + 0] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }

    for (let i = 0; i < MAX; i++) {
      angles[i] += angularSpeeds[i] * swirl * dt;
      radiuses[i] -= inwardBase[i] * inward * dt;
      if (radiuses[i] < INNER_R) {
        radiuses[i] =
          CHARGE_AURA_OUTER_R + Math.random() * CHARGE_AURA_OUTER_R_JITTER;
        angles[i] = Math.random() * Math.PI * 2;
        pickChargeColor(tmpColor, t);
        colors[i * 3 + 0] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;
      }
      positions[i * 3 + 0] = center.x + Math.cos(angles[i]) * radiuses[i];
      positions[i * 3 + 1] = center.y + Math.sin(angles[i]) * radiuses[i];
      positions[i * 3 + 2] = center.z;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    material.size = 0.45 + t * 0.9;
    material.opacity = Math.min(1, 0.3 + t * 0.9);

    // コア: step 0.3 以降で徐々に見え始め、満チャージで 12 Hz 脈動
    const coreAppear = Math.max(0, (t - 0.3) / 0.7);
    const pulse = t >= 0.98 ? 1 + 0.35 * Math.sin(elapsed * 12) : 1;
    coreMat.size = (0.6 + coreAppear * 3.0) * pulse;
    coreMat.opacity = Math.min(1, coreAppear * pulse);
  }

  function setStep(step: number): void {
    currentStep = step;
  }

  function dispose(): void {
    scene.remove(points);
    scene.remove(core);
    geometry.dispose();
    material.dispose();
    coreGeo.dispose();
    coreMat.dispose();
  }

  return { update, setStep, dispose };
}

/**
 * チャージ段階 (0..1) に応じた色を返す。
 *  - t 小: warm 帯のみ (orange..yellow) → 火種っぽい
 *  - t 中: 暖色中心からスプレッドが広がり、緑や青が混じり始める
 *  - t 1 付近: hue 全域 (虹色) で満チャージを表現
 *
 * 中心は 0.12 (orange) に固定し、spread を広げる方針。ブレンド移行が滑らかに
 * 見える (いきなり無関係な色が混じらない)。
 */
function pickChargeColor(target: THREE.Color, t: number): void {
  const spread = 0.1 + t * 1.1;
  let hue = 0.12 + (Math.random() - 0.5) * spread;
  hue = ((hue % 1) + 1) % 1;
  const sat = 0.9 + t * 0.08;
  const light = 0.6 + t * 0.08;
  target.setHSL(hue, sat, light);
}
