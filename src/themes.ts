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
        /** 複数の hue 帯を列挙。各粒子は一様ランダムにどれか 1 つを選ぶ */
        hueRanges: Array<{ hueMin: number; hueMax: number }>;
        sparkleChance: number; // 白キラキラ粒子の混ざる確率
      };
  /** Rocket 本体の色。省略時は既定色が使われる */
  rocketColor?: number;
};

export interface ThemePicker {
  /** 単色 (= 1 つの hue 帯のみ) のテーマを返す */
  pick(): BurstTheme;
  /**
   * `count` 個のベーステーマの hue 帯をマージしたテーマを返す。
   * チャージ量に応じて粒子の色が混ざる演出に使う。
   * count <= 1 は pick() と等価、count が候補数を超えた分は切り詰める。
   */
  pickBlend(count: number): BurstTheme;
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
  const themes: BurstTheme[] = [
    createGlowTheme(glowTexture, perf, 0.92, 0.96, 0xff66cc),
    createGlowTheme(glowTexture, perf, 0.1, 0.15, 0xffd866),
    createGlowTheme(glowTexture, perf, 0.5, 0.55, 0x66e0ff),
    createGlowTheme(glowTexture, perf, 0.3, 0.38, 0x88ee88),
  ];

  function pickDistinct(count: number): BurstTheme[] {
    const indices = themes.map((_, i) => i);
    // Fisher-Yates で前 count 要素だけシャッフル
    const take = Math.max(1, Math.min(count, indices.length));
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(Math.random() * (indices.length - i));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, take).map((i) => themes[i]);
  }

  return {
    pick() {
      return themes[Math.floor(Math.random() * themes.length)];
    },
    pickBlend(count) {
      const picked = pickDistinct(count);
      if (picked.length === 1) return picked[0];
      const base = picked[0];
      const hueRanges: Array<{ hueMin: number; hueMax: number }> = [];
      for (const t of picked) {
        if (t.coloring.mode === "hsl") hueRanges.push(...t.coloring.hueRanges);
      }
      return {
        ...base,
        coloring: {
          mode: "hsl",
          hueRanges,
          sparkleChance:
            base.coloring.mode === "hsl" ? base.coloring.sparkleChance : 0.08,
        },
      };
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
      hueRanges: [{ hueMin, hueMax }],
      sparkleChance: 0.08,
    },
    rocketColor,
  };
}
