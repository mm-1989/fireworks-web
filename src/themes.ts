import * as THREE from "three";
import { createEmojiTexture } from "./emojiTexture";
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
 */
export function createThemePicker(
  glowTexture: THREE.Texture,
  perf: TierInfo,
): ThemePicker {
  const pink = createPinkTheme(glowTexture, perf);
  const ice = createEmojiBurstTheme("🍦", 0xfff0b0, perf);
  const fries = createEmojiBurstTheme("🍟", 0xffcc33, perf);
  const strawberry = createEmojiBurstTheme("🍓", 0xff4466, perf);
  const donut = createEmojiBurstTheme("🍩", 0xff99bb, perf);

  // 5% ピンク / 食べ物 各 ~23.75%
  const pool: { theme: BurstTheme; weight: number }[] = [
    { theme: pink, weight: 5 },
    { theme: ice, weight: 24 },
    { theme: fries, weight: 24 },
    { theme: strawberry, weight: 24 },
    { theme: donut, weight: 23 },
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

function createPinkTheme(
  glowTexture: THREE.Texture,
  perf: TierInfo,
): BurstTheme {
  return {
    texture: glowTexture,
    particleCount: Math.round(600 * perf.scale),
    particleSize: 3.2,
    speedMin: 14,
    speedMax: 32,
    gravity: -12,
    lifetime: 3.2,
    blending: THREE.AdditiveBlending,
    coloring: {
      mode: "hsl",
      hueMin: 0.92,
      hueMax: 0.96,
      sparkleChance: 0.08,
    },
    rocketColor: 0xff66cc,
  };
}

// 絵文字系: NormalBlending + uniform白 で絵文字の自然な色を保つ
function createEmojiBurstTheme(
  emoji: string,
  rocketColor: number,
  perf: TierInfo,
): BurstTheme {
  return {
    texture: createEmojiTexture(emoji, 128),
    // 絵文字は視認できる最低粒数を確保
    particleCount: Math.max(24, Math.round(90 * perf.scale)),
    particleSize: 3.8,
    speedMin: 10,
    speedMax: 22,
    gravity: -10,
    lifetime: 3.0,
    blending: THREE.NormalBlending,
    coloring: { mode: "uniform", color: 0xffffff },
    rocketColor,
  };
}
