import * as THREE from "three";
import type { TierInfo } from "./performanceTier";

/**
 * 花火の見た目を決めるテーマ設定。
 * `burst` / `rocket` モジュールはこの型を受け取って挙動をパラメトライズする。
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
  /** パーティクル色の決め方 */
  coloring:
    | { mode: "uniform"; color: number } // 全粒子同じ色 (絵文字系)
    | {
        mode: "hsl";
        hueMin: number;
        hueMax: number;
        sparkleChance: number; // 白キラキラ粒子の混ざる確率
      };
  /** Rocket 本体の色。省略時は既定色が使われる */
  rocketColor?: number;
};

export interface ThemePicker {
  pick(): BurstTheme;
}

/**
 * デバイス性能に応じて粒子数をスケールしたテーマ群を作り、
 * 重み付きランダムで 1 つ返す pick() を提供する。
 *
 * Phase A: 絵文字テーマは残留レイヤの検証観点で不要なので一旦外し、glow のみで色相違いを展開する。
 */
export function createThemePicker(
  glowTexture: THREE.Texture,
  perf: TierInfo,
): ThemePicker {
  const pink = createGlowTheme(glowTexture, perf, 0.92, 0.96, 0xff66cc);
  const gold = createGlowTheme(glowTexture, perf, 0.1, 0.15, 0xffd866);
  const cyan = createGlowTheme(glowTexture, perf, 0.5, 0.55, 0x66e0ff);
  const green = createGlowTheme(glowTexture, perf, 0.3, 0.38, 0x88ee88);

  const pool: { theme: BurstTheme; weight: number }[] = [
    { theme: pink, weight: 25 },
    { theme: gold, weight: 25 },
    { theme: cyan, weight: 25 },
    { theme: green, weight: 25 },
  ];
  const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);

  return {
    pick() {
      let r = Math.random() * totalWeight;
      for (const entry of pool) {
        r -= entry.weight;
        if (r <= 0) return entry.theme;
      }
      return pool[0].theme;
    },
  };
}

function createGlowTheme(
  glowTexture: THREE.Texture,
  perf: TierInfo,
  hueMin: number,
  hueMax: number,
  rocketColor: number,
): BurstTheme {
  return {
    texture: glowTexture,
    particleCount: Math.round(600 * perf.scale),
    particleSize: 3.2,
    speedMin: 14,
    speedMax: 32,
    gravity: -12,
    lifetime: 2.0,
    blending: THREE.AdditiveBlending,
    coloring: {
      mode: "hsl",
      hueMin,
      hueMax,
      sparkleChance: 0.08,
    },
    rocketColor,
  };
}
