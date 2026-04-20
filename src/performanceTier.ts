/**
 * 起動時にデバイス性能を推定し、パーティクル数のスケール倍率を決める。
 *
 * 判定軸:
 *  - navigator.hardwareConcurrency: 論理CPUコア数
 *  - navigator.deviceMemory: 概算メモリ量(GB) ※iOS Safariは未対応
 *
 * iOS Safariは deviceMemory を返さないため、cores のみでも判定が成立するよう閾値設計。
 */
export type PerformanceTier = "low" | "mid" | "high";

export interface TierInfo {
  tier: PerformanceTier;
  scale: number; // particleCountにかける倍率
  cores: number;
  memoryGB: number | null;
}

export function detectPerformanceTier(): TierInfo {
  const cores = navigator.hardwareConcurrency ?? 2;
  const memoryGB = (navigator as any).deviceMemory ?? null;

  let tier: PerformanceTier;
  if (cores <= 2 || (memoryGB !== null && memoryGB <= 2)) {
    tier = "low";
  } else if (cores >= 6 && (memoryGB === null || memoryGB >= 4)) {
    tier = "high";
  } else {
    tier = "mid";
  }

  const scale = tier === "low" ? 0.4 : tier === "mid" ? 0.7 : 1.0;
  return { tier, scale, cores, memoryGB };
}
