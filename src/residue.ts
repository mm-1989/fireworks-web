import * as THREE from "three";
import { type Burst, computeBurstPositions } from "./burst";
import {
  CLEAR_BRIGHT_THRESHOLD,
  CLEAR_SAMPLE_SIZE,
  RESIDUE_ALPHA,
  RESIDUE_CROSS_BURST_SUB_SAMPLE,
  RESIDUE_RADIUS_SCALE,
} from "./config";
import type { ResidueCrosses } from "./residueCrosses";

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
  /**
   * burst の全粒子を現在位置で焼き付ける。位置は JS 側で (now - burst.born) から
   * 再計算する (GPU 積分と同じ式)。`now` は呼び出し元の game clock.elapsedTime。
   */
  stampBurst(burst: Burst, now: number): void;
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
   * overlayCanvas を渡すと、その canvas (通常は WebGL scene) を residue の上に
   * 重ねてから書き出す。呼び出し直前に renderer.render() を同 tick 内で呼んで
   * drawing buffer を確保しておくこと (preserveDrawingBuffer=false のため)。
   */
  toDataURL(overlayCanvas?: HTMLCanvasElement): string;
}

export function createResidueLayer(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  crosses: ResidueCrosses | null = null,
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
   * 指定位置に core グラデ (中心放射) を 1 粒描画する。
   * 十字 ray は residueCrosses (GL 粒子) が担当するので、ここでは core だけ焼く。
   * 呼び出し側で globalAlpha を事前設定しておくこと。
   */
  function drawGlow(x: number, y: number, radius: number, rgb: string): void {
    const core = ctx.createRadialGradient(x, y, 0, x, y, radius);
    core.addColorStop(0.0, `rgba(${rgb},1)`);
    core.addColorStop(0.15, `rgba(${rgb},0.85)`);
    core.addColorStop(0.4, `rgba(${rgb},0.3)`);
    core.addColorStop(1.0, `rgba(${rgb},0)`);
    ctx.fillStyle = core;
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

  const worldTmp = new THREE.Vector3();
  const colorTmp = new THREE.Color();

  // GPU で位置を持つので、stamp 時に JS 側で同じ式を評価する。burst ごとに配列を
  // 毎回確保すると GC pressure になるので、再利用バッファ (必要時のみ grow) を持つ。
  let burstPosBuffer = new Float32Array(0);

  function stampBurst(burst: Burst, now: number): void {
    if (burstPosBuffer.length < burst.count * 3) {
      burstPosBuffer = new Float32Array(burst.count * 3);
    }
    const positions = computeBurstPositions(burst, now, burstPosBuffer);
    const colors = burst.points.geometry.attributes.color.array as Float32Array;
    const material = burst.points.material as THREE.PointsMaterial;
    const radius =
      computeVisualRadiusPx(material.size, camera, canvas.height) *
      RESIDUE_RADIUS_SCALE;

    ctx.globalAlpha = RESIDUE_ALPHA;
    for (let i = 0; i < burst.count; i++) {
      const wx = positions[i * 3];
      const wy = positions[i * 3 + 1];
      const wz = positions[i * 3 + 2];
      projected.set(wx, wy, wz);
      projected.project(camera);
      if (projected.z < -1 || projected.z > 1) continue;

      const x = (projected.x + 1) * 0.5 * canvas.width;
      const y = (-projected.y + 1) * 0.5 * canvas.height;
      const cr = colors[i * 3];
      const cg = colors[i * 3 + 1];
      const cb = colors[i * 3 + 2];
      const r = Math.round(cr * 255);
      const g = Math.round(cg * 255);
      const b = Math.round(cb * 255);
      drawGlow(x, y, radius, `${r},${g},${b}`);
      if (crosses && i % RESIDUE_CROSS_BURST_SUB_SAMPLE === 0) {
        worldTmp.set(wx, wy, wz);
        colorTmp.setRGB(cr, cg, cb);
        crosses.addAt(worldTmp, colorTmp);
      }
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
    crosses?.addAt(worldPos, color);
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
    crosses?.clear();
  }

  function toDataURL(overlayCanvas?: HTMLCanvasElement): string {
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const outCtx = requireCtx(out);
    outCtx.fillStyle = "#000";
    outCtx.fillRect(0, 0, out.width, out.height);
    outCtx.drawImage(canvas, 0, 0);
    if (overlayCanvas) {
      // WebGL canvas の backing buffer は pixelRatio 倍の解像度を持つので
      // 明示的に residue canvas のサイズに揃えて drawImage で縮小合成する。
      outCtx.drawImage(overlayCanvas, 0, 0, out.width, out.height);
    }
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
