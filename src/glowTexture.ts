import * as THREE from "three";

/**
 * 中心ほど明るい放射グラデーションのテクスチャを動的生成する。
 * 画像ファイル不要 = バンドルサイズ増加なし + 著作権リスクなし。
 *
 * 使い方: PointsMaterial の `map` に指定し、`transparent: true`・
 * `blending: THREE.AdditiveBlending` と組み合わせると火の粉感が出る。
 */
export function createGlowTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context not supported");

  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  gradient.addColorStop(0.15, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.3)");
  gradient.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  // Three.js r152+ の既定レンダリング空間に合わせ、sRGB ソースとして扱う
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
