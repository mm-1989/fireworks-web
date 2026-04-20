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
    pickWarmColor(tmpColor);
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

  let currentStep = 0;

  function update(dt: number): void {
    const t = Math.min(1, currentStep / CHARGE_MAX_STEPS);
    const swirl = 0.5 + t * 1.8;
    const inward = 0.25 + t * 1.9;

    for (let i = 0; i < MAX; i++) {
      angles[i] += angularSpeeds[i] * swirl * dt;
      radiuses[i] -= inwardBase[i] * inward * dt;
      if (radiuses[i] < INNER_R) {
        radiuses[i] =
          CHARGE_AURA_OUTER_R + Math.random() * CHARGE_AURA_OUTER_R_JITTER;
        angles[i] = Math.random() * Math.PI * 2;
        pickWarmColor(tmpColor);
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
  }

  function setStep(step: number): void {
    currentStep = step;
  }

  function dispose(): void {
    scene.remove(points);
    geometry.dispose();
    material.dispose();
  }

  return { update, setStep, dispose };
}

/** 火の粉っぽい暖色帯 (orange..yellow) でランダムに色を決める */
function pickWarmColor(target: THREE.Color): void {
  const hue = 0.06 + Math.random() * 0.12; // 約 22°..65° (orange..yellow)
  target.setHSL(hue, 0.95, 0.62);
}
