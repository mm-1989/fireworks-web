import * as THREE from "three";

/**
 * 絵文字1文字をCanvasに描画しThree.js用テクスチャ化する。
 *
 * 透過背景なので AdditiveBlending と組み合わせると色味が崩れる。
 * NormalBlending + transparent:true で絵文字そのままの色を出す。
 */
export function createEmojiTexture(
  emoji: string,
  size = 128,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context not supported");

  ctx.font =
    `${Math.floor(size * 0.82)}px ` +
    `"Apple Color Emoji", "Segoe UI Emoji", ` +
    `"Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  // 絵文字の滑らかなフチを保つため線形フィルタ
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // 絵文字の色味を正しく出すため sRGB として扱う
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
