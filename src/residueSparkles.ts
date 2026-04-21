import * as THREE from "three";
import {
  RESIDUE_SPARKLE_BRIGHT_THRESHOLD,
  RESIDUE_SPARKLE_JITTER_WORLD,
  RESIDUE_SPARKLE_LIFE_MAX,
  RESIDUE_SPARKLE_LIFE_MIN,
  RESIDUE_SPARKLE_MAP_REFRESH_SEC,
  RESIDUE_SPARKLE_MAX,
  RESIDUE_SPARKLE_RESPAWN_CHANCE,
  RESIDUE_SPARKLE_SAMPLE_SIZE,
  RESIDUE_SPARKLE_SIZE,
} from "./config";
import { applySparklePatch, createSeedAttribute } from "./sparkleShader";

/**
 * 焼き付け背景 (residue canvas) を常時キラキラさせる overlay。
 *
 * 仕組み:
 *  1. residue を低解像度 (SAMPLE_SIZE) にダウンサンプルして明部ピクセル一覧を
 *     定期的 (REFRESH_SEC ごと) に取得する。
 *  2. 固定数の粒子スロットを確保し、死んだスロットは明部ピクセルの 1 つを
 *     ランダムに拾って world 座標へ投影し spawn する。
 *  3. 各粒子は sin(u*π) の envelope で fade-in → peak → fade-out し、寿命が
 *     尽きたら死んで再生成候補に戻る。
 *
 * 色は spawn 時に元の焼き付け色 (低明度込み) を採用するので、焼き付けと自然に
 * 馴染む。sparkle patch 経由でキラキラ/十字/微回転が自動で乗る。
 *
 * 性能メモ:
 *  - getImageData は SAMPLE_SIZE^2 のみで済む (64x64 = 4096 px) → 1 ms 未満
 *  - 粒子更新は MAX 件分の色/位置書き換え。 100 粒子なら無視できる
 */
export interface ResidueSparkles {
  update(dt: number): void;
  dispose(): void;
}

interface BrightPixel {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
}

export function createResidueSparkles(
  scene: THREE.Scene,
  texture: THREE.Texture,
  camera: THREE.PerspectiveCamera,
  residueCanvas: HTMLCanvasElement,
): ResidueSparkles {
  const MAX = RESIDUE_SPARKLE_MAX;
  const SAMPLE = RESIDUE_SPARKLE_SAMPLE_SIZE;

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = SAMPLE;
  sampleCanvas.height = SAMPLE;
  const rawCtx = sampleCanvas.getContext("2d");
  if (!rawCtx) throw new Error("2D context not supported");
  // 非 null な別名に束縛しないと、refreshMap の中でナローイングが外れる
  const sampleCtx: CanvasRenderingContext2D = rawCtx;

  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const baseColors = new Float32Array(MAX * 3);
  const ages = new Float32Array(MAX);
  const lifetimes = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) ages[i] = -1;

  const brightPixels: BrightPixel[] = [];
  // 初期値を閾値以上にして初回 update で即 refresh させる
  let mapRefreshTimer = RESIDUE_SPARKLE_MAP_REFRESH_SEC;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("seed", createSeedAttribute(MAX));

  const material = new THREE.PointsMaterial({
    size: RESIDUE_SPARKLE_SIZE,
    map: texture,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  applySparklePatch(material);

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const tmpVec = new THREE.Vector3();

  function refreshMap(): void {
    sampleCtx.clearRect(0, 0, SAMPLE, SAMPLE);
    sampleCtx.drawImage(residueCanvas, 0, 0, SAMPLE, SAMPLE);
    const data = sampleCtx.getImageData(0, 0, SAMPLE, SAMPLE).data;
    brightPixels.length = 0;
    for (let y = 0; y < SAMPLE; y++) {
      for (let x = 0; x < SAMPLE; x++) {
        const i = (y * SAMPLE + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if ((r + g + b) / 3 > RESIDUE_SPARKLE_BRIGHT_THRESHOLD) {
          brightPixels.push({ x, y, r, g, b });
        }
      }
    }
  }

  /** サンプル座標 (0..SAMPLE) を z=0 平面の world 座標に変換 */
  function sampleToWorld(sx: number, sy: number, out: THREE.Vector3): void {
    const ndcX = (sx / SAMPLE) * 2 - 1;
    const ndcY = -((sy / SAMPLE) * 2 - 1);
    out.set(ndcX, ndcY, 0.5).unproject(camera);
    out.sub(camera.position);
    const distance = -camera.position.z / out.z;
    out.multiplyScalar(distance).add(camera.position);
  }

  function spawn(i: number): boolean {
    if (brightPixels.length === 0) return false;
    const p = brightPixels[Math.floor(Math.random() * brightPixels.length)];
    sampleToWorld(p.x + Math.random(), p.y + Math.random(), tmpVec);
    positions[i * 3 + 0] =
      tmpVec.x + (Math.random() - 0.5) * RESIDUE_SPARKLE_JITTER_WORLD;
    positions[i * 3 + 1] =
      tmpVec.y + (Math.random() - 0.5) * RESIDUE_SPARKLE_JITTER_WORLD;
    positions[i * 3 + 2] = tmpVec.z;
    baseColors[i * 3 + 0] = p.r / 255;
    baseColors[i * 3 + 1] = p.g / 255;
    baseColors[i * 3 + 2] = p.b / 255;
    ages[i] = 0;
    lifetimes[i] =
      RESIDUE_SPARKLE_LIFE_MIN +
      Math.random() * (RESIDUE_SPARKLE_LIFE_MAX - RESIDUE_SPARKLE_LIFE_MIN);
    return true;
  }

  function setInvisible(i: number): void {
    colors[i * 3 + 0] = 0;
    colors[i * 3 + 1] = 0;
    colors[i * 3 + 2] = 0;
  }

  function update(dt: number): void {
    mapRefreshTimer += dt;
    if (mapRefreshTimer >= RESIDUE_SPARKLE_MAP_REFRESH_SEC) {
      refreshMap();
      mapRefreshTimer = 0;
    }

    for (let i = 0; i < MAX; i++) {
      if (ages[i] < 0) {
        // 死亡スロットは確率的に spawn を試みる。残留が無ければ何もしない
        if (Math.random() < RESIDUE_SPARKLE_RESPAWN_CHANCE) spawn(i);
        if (ages[i] < 0) {
          setInvisible(i);
          continue;
        }
      } else {
        ages[i] += dt;
      }
      const u = ages[i] / lifetimes[i];
      if (u >= 1) {
        ages[i] = -1;
        setInvisible(i);
        continue;
      }
      // fade-in → peak → fade-out エンベロープ
      const env = Math.sin(u * Math.PI);
      colors[i * 3 + 0] = baseColors[i * 3 + 0] * env;
      colors[i * 3 + 1] = baseColors[i * 3 + 1] * env;
      colors[i * 3 + 2] = baseColors[i * 3 + 2] * env;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  function dispose(): void {
    scene.remove(points);
    geometry.dispose();
    material.dispose();
  }

  return { update, dispose };
}
