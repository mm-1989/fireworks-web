import { CHARGE_MAX_STEPS, CHARGE_STEP_MS } from "./config";
import type { BurstTheme } from "./themes";

/**
 * 保持時間 (ms) から段階 (0..CHARGE_MAX_STEPS) を算出。
 * 0 は「クイックタップ」= 最小 burst、CHARGE_MAX_STEPS で最大溜め。
 */
export function computeChargeStep(holdMs: number): number {
  const step = Math.floor(holdMs / CHARGE_STEP_MS);
  if (step < 0) return 0;
  if (step > CHARGE_MAX_STEPS) return CHARGE_MAX_STEPS;
  return step;
}

/**
 * テーマを段階値でスケールして新しい BurstTheme を返す。
 * 元テーマは変更しない (themePicker が返す共有オブジェクトを壊さないため)。
 *
 * 段階 0 → 10 で各軸が線形に下限→上限へ補間される:
 *   particleCount: 0.5x → 2.0x   (300 → 1200 @baseline 600)
 *   speed (min/max): 0.7x → 1.3x (速度幅は保ったまま伸縮)
 *   particleSize:  0.85x → 1.25x (3.2 → 2.72..4.0)
 *   lifetime:      0.7x → 1.3x   (2.0 → 1.4..2.6)
 */
export function applyChargeToTheme(
  theme: BurstTheme,
  step: number,
): BurstTheme {
  const t = Math.min(1, Math.max(0, step / CHARGE_MAX_STEPS));
  const countFactor = 0.5 + t * 1.5;
  const speedFactor = 0.7 + t * 0.6;
  const sizeFactor = 0.85 + t * 0.4;
  const lifetimeFactor = 0.7 + t * 0.6;

  return {
    ...theme,
    particleCount: Math.max(
      40,
      Math.round(theme.particleCount * countFactor),
    ),
    speedMin: theme.speedMin * speedFactor,
    speedMax: theme.speedMax * speedFactor,
    particleSize: theme.particleSize * sizeFactor,
    lifetime: theme.lifetime * lifetimeFactor,
  };
}
