import * as THREE from "three";

/**
 * 中心放射グラデ + 十字 anamorphic ray + 斜め spike を重ねたスター型光源テクスチャ。
 * 画像ファイル不要 = バンドルサイズ増加なし + 著作権リスクなし。
 *
 * 構成:
 *  1. core     : 中心ほど強い放射グラデ (従来の glow)
 *  2. h-ray    : 水平方向に細く伸びる光芒 (scale で縦を潰した放射グラデ)
 *  3. v-ray    : 垂直方向に細く伸びる光芒
 *  4. diag-ray : 45度/135度のやや短いスパイク (控えめ)
 *
 * 合成は全て `lighter` (加算)。AdditiveBlending と bloom を通ると、
 * 粒子が十字スター型のフレアを放って見える。
 *
 * 使い方: PointsMaterial の `map` に指定し、`transparent: true`・
 * `blending: THREE.AdditiveBlending` と組み合わせる。
 */
export function createGlowTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context not supported");

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  // 透明初期化 (明示)
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = "lighter";

  drawCore(ctx, cx, cy, r);
  drawRay(ctx, cx, cy, r * 0.6, 1, 0.07, 0.75); // 水平
  drawRay(ctx, cx, cy, r * 0.6, 0.07, 1, 0.75); // 垂直
  drawDiagonalSpike(ctx, cx, cy, r * 0.4, Math.PI / 4, 0.4);
  drawDiagonalSpike(ctx, cx, cy, r * 0.4, -Math.PI / 4, 0.4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  // Three.js r152+ の既定レンダリング空間に合わせ、sRGB ソースとして扱う
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 中心放射グラデ。既存ルックの継承 */
function drawCore(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  g.addColorStop(0.12, "rgba(255, 255, 255, 0.85)");
  g.addColorStop(0.35, "rgba(255, 255, 255, 0.28)");
  g.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 放射グラデを sx/sy で異方スケールして細長い光芒を描く。
 * sx=1, sy=0.1 → 水平に伸びる細い線 (anamorphic ray)。
 *
 * save/translate/scale してから原点を中心として drawRadialGradient することで
 * 楕円形のグラデが得られる。alpha は最大強度。
 */
function drawRay(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  sx: number,
  sy: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sx, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
  g.addColorStop(0.0, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
  g.addColorStop(0.15, `rgba(255, 255, 255, ${(alpha * 0.6).toFixed(3)})`);
  g.addColorStop(0.5, `rgba(255, 255, 255, ${(alpha * 0.15).toFixed(3)})`);
  g.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, len, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 45度系スパイク。rotate を挟んで drawRay を呼ぶだけだが、長さを短めにして
 * 水平/垂直より主張を弱める。
 */
function drawDiagonalSpike(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  angle: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(1, 0.07);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
  g.addColorStop(0.0, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
  g.addColorStop(0.2, `rgba(255, 255, 255, ${(alpha * 0.45).toFixed(3)})`);
  g.addColorStop(0.6, `rgba(255, 255, 255, ${(alpha * 0.1).toFixed(3)})`);
  g.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, len, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
