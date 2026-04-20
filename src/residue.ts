import * as THREE from "three";
import type { Burst } from "./burst";
import {
  CLEAR_BRIGHT_THRESHOLD,
  CLEAR_SAMPLE_SIZE,
  RESIDUE_ALPHA,
  RESIDUE_RADIUS_SCALE,
} from "./config";

/**
 * 花火粒子を焼き付けていく背景レイヤ。Scene の下に敷いた 2D canvas に直接描画する。
 *
 * マスク抽象を持ち、将来的に星・ハート型シェイプ内だけを「埋めるべき領域」とする
 * モードへ拡張できる。Phase A では mask=null で全画面を対象にする。
 *
 * stamp の見た目は glow テクスチャと同じプロファイルの放射グラデーションで描画し、
 * 半径は camera/canvas から逆算した画面上の粒子サイズに合わせる。
 *
 * 既知の制約 (Phase A):
 *  - ウィンドウリサイズで canvas は再初期化され、既存の焼き付けは消える
 */
export interface ResidueLayer {
  /** burst の全粒子を現在位置で焼き付ける */
  stampBurst(burst: Burst): void;
  /**
   * 1 点を焼き付ける。shooting star の軌跡を毎フレーム残す用途で使う。
   * `particleSize` は world 単位。camera 投影で画面 px 半径に換算される。
   */
  stampPoint(
    worldPos: THREE.Vector3,
    color: THREE.Color,
    particleSize: number,
  ): void;
  /** 埋まり率 0..1。mask 指定時は mask 内のみ対象 */
  computeFillRate(): number;
  /** マスク canvas を設定。null で全画面。マスクの alpha>128 を対象領域とする */
  setMask(mask: HTMLCanvasElement | null): void;
  /** 焼き付けを全消去 */
  clear(): void;
  /**
   * 現在の焼き付け結果を黒背景で合成した PNG data URL を返す。
   * canvas 自体は透過のため、保存画像で夜空の黒が欲しい場合はこちらを使う。
   */
  toDataURL(): string;
}

export function createResidueLayer(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
): ResidueLayer {
  const ctx: CanvasRenderingContext2D = requireCtx(canvas);

  // クリア判定用の低解像度サンプリングバッファ
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = CLEAR_SAMPLE_SIZE;
  sampleCanvas.height = CLEAR_SAMPLE_SIZE;
  const sampleCtx: CanvasRenderingContext2D = requireCtx(sampleCanvas);

  let maskCanvas: HTMLCanvasElement | null = null;

  function resize(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  const projected = new THREE.Vector3();

  /**
   * 指定位置に glow 形状 (中心ほど不透明・縁はフェード) を 1 粒描画する。
   * 呼び出し側で globalAlpha を事前設定しておくこと。
   */
  function drawGlow(x: number, y: number, radius: number, rgb: string): void {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0.0, `rgba(${rgb},1)`);
    grad.addColorStop(0.15, `rgba(${rgb},0.85)`);
    grad.addColorStop(0.4, `rgba(${rgb},0.3)`);
    grad.addColorStop(1.0, `rgba(${rgb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function projectToCanvas(worldPos: THREE.Vector3): { x: number; y: number } | null {
    projected.copy(worldPos).project(camera);
    if (projected.z < -1 || projected.z > 1) return null;
    return {
      x: (projected.x + 1) * 0.5 * canvas.width,
      y: (-projected.y + 1) * 0.5 * canvas.height,
    };
  }

  function stampBurst(burst: Burst): void {
    const positions = burst.points.geometry.attributes.position
      .array as Float32Array;
    const colors = burst.points.geometry.attributes.color.array as Float32Array;
    const material = burst.points.material as THREE.PointsMaterial;
    const radius =
      computeVisualRadiusPx(material.size, camera, canvas.height) *
      RESIDUE_RADIUS_SCALE;

    ctx.globalAlpha = RESIDUE_ALPHA;
    for (let i = 0; i < burst.count; i++) {
      projected.set(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
      );
      projected.project(camera);
      if (projected.z < -1 || projected.z > 1) continue;

      const x = (projected.x + 1) * 0.5 * canvas.width;
      const y = (-projected.y + 1) * 0.5 * canvas.height;
      const r = Math.round(colors[i * 3] * 255);
      const g = Math.round(colors[i * 3 + 1] * 255);
      const b = Math.round(colors[i * 3 + 2] * 255);
      drawGlow(x, y, radius, `${r},${g},${b}`);
    }
    ctx.globalAlpha = 1;
  }

  function stampPoint(
    worldPos: THREE.Vector3,
    color: THREE.Color,
    particleSize: number,
  ): void {
    const pt = projectToCanvas(worldPos);
    if (!pt) return;
    const radius =
      computeVisualRadiusPx(particleSize, camera, canvas.height) *
      RESIDUE_RADIUS_SCALE;
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    ctx.globalAlpha = RESIDUE_ALPHA;
    drawGlow(pt.x, pt.y, radius, `${r},${g},${b}`);
    ctx.globalAlpha = 1;
  }

  function computeFillRate(): number {
    sampleCtx.clearRect(0, 0, CLEAR_SAMPLE_SIZE, CLEAR_SAMPLE_SIZE);
    sampleCtx.drawImage(canvas, 0, 0, CLEAR_SAMPLE_SIZE, CLEAR_SAMPLE_SIZE);
    const residueData = sampleCtx.getImageData(
      0,
      0,
      CLEAR_SAMPLE_SIZE,
      CLEAR_SAMPLE_SIZE,
    ).data;

    let maskData: Uint8ClampedArray | null = null;
    if (maskCanvas) {
      sampleCtx.clearRect(0, 0, CLEAR_SAMPLE_SIZE, CLEAR_SAMPLE_SIZE);
      sampleCtx.drawImage(
        maskCanvas,
        0,
        0,
        CLEAR_SAMPLE_SIZE,
        CLEAR_SAMPLE_SIZE,
      );
      maskData = sampleCtx.getImageData(
        0,
        0,
        CLEAR_SAMPLE_SIZE,
        CLEAR_SAMPLE_SIZE,
      ).data;
    }

    let target = 0;
    let filled = 0;
    const total = CLEAR_SAMPLE_SIZE * CLEAR_SAMPLE_SIZE;
    for (let i = 0; i < total; i++) {
      const inMask = maskData ? maskData[i * 4 + 3] > 128 : true;
      if (!inMask) continue;
      target++;
      const r = residueData[i * 4];
      const g = residueData[i * 4 + 1];
      const b = residueData[i * 4 + 2];
      if ((r + g + b) / 3 > CLEAR_BRIGHT_THRESHOLD) filled++;
    }
    return target === 0 ? 0 : filled / target;
  }

  function setMask(mask: HTMLCanvasElement | null): void {
    maskCanvas = mask;
  }

  function clear(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function toDataURL(): string {
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const outCtx = requireCtx(out);
    outCtx.fillStyle = "#000";
    outCtx.fillRect(0, 0, out.width, out.height);
    outCtx.drawImage(canvas, 0, 0);
    return out.toDataURL("image/png");
  }

  return {
    stampBurst,
    stampPoint,
    computeFillRate,
    setMask,
    clear,
    toDataURL,
  };
}

/**
 * PointsMaterial の world-space `size` を画面上の px 半径に換算する。
 * Three.js の sizeAttenuation=true (既定) の式に従う。
 */
function computeVisualRadiusPx(
  particleSize: number,
  camera: THREE.PerspectiveCamera,
  canvasHeight: number,
): number {
  const fovYRad = (camera.fov * Math.PI) / 180;
  const depth = Math.abs(camera.position.z);
  return (particleSize * canvasHeight) / (4 * depth * Math.tan(fovYRad / 2));
}

function requireCtx(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context not supported");
  return ctx;
}
