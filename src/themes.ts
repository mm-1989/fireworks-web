import * as THREE from "three";
import type { TierInfo } from "./performanceTier";

/**
 * 花火の見た目を決めるテーマ設定。
 * `burst` モジュールはこの型を受け取って挙動をパラメトライズする。
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
  /** パーティクル色の決め方。複数の hue 帯を列挙し、各粒子は一様ランダムにどれか 1 つを選ぶ */
  coloring: {
    hueRanges: Array<{ hueMin: number; hueMax: number }>;
    sparkleChance: number; // 白キラキラ粒子の混ざる確率
  };
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
  /** ランダムなテーマの hue 帯から 1 色サンプリング。流れ星の色付け用 */
  pickAccentColor(target: THREE.Color): THREE.Color;
}

/**
 * デバイス性能に応じて粒子数をスケールしたテーマ群を作り、
 * ランダムで 1 つ返す pick()、または複数の hue 帯をマージする pickBlend() を提供する。
 */
export function createThemePicker(
  glowTexture: THREE.Texture,
  perf: TierInfo,
): ThemePicker {
  const themes: BurstTheme[] = [
    createGlowTheme(glowTexture, perf, 0.92, 0.96),
    createGlowTheme(glowTexture, perf, 0.1, 0.15),
    createGlowTheme(glowTexture, perf, 0.5, 0.55),
    createGlowTheme(glowTexture, perf, 0.3, 0.38),
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
      for (const t of picked) hueRanges.push(...t.coloring.hueRanges);
      return {
        ...base,
        coloring: {
          hueRanges,
          sparkleChance: base.coloring.sparkleChance,
        },
      };
    },
    pickAccentColor(target) {
      const theme = themes[Math.floor(Math.random() * themes.length)];
      const range =
        theme.coloring.hueRanges[
          Math.floor(Math.random() * theme.coloring.hueRanges.length)
        ];
      target.setHSL(
        range.hueMin + Math.random() * (range.hueMax - range.hueMin),
        1.0,
        0.75,
      );
      return target;
    },
  };
}

function createGlowTheme(
  glowTexture: THREE.Texture,
  perf: TierInfo,
  hueMin: number,
  hueMax: number,
): BurstTheme {
  return {
    texture: glowTexture,
    particleCount: Math.round(400 * perf.scale),
    particleSize: 3.2,
    speedMin: 14,
    speedMax: 32,
    gravity: -12,
    lifetime: 2.0,
    blending: THREE.AdditiveBlending,
    coloring: {
      hueRanges: [{ hueMin, hueMax }],
      sparkleChance: 0.08,
    },
  };
}
