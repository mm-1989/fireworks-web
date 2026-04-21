import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  BLOOM_RADIUS,
  BLOOM_STRENGTH_HIGH,
  BLOOM_STRENGTH_MID,
  BLOOM_THRESHOLD,
} from "./config";
import type { TierInfo } from "./performanceTier";

export interface PostFx {
  render(): void;
  setSize(width: number, height: number): void;
}

/**
 * Bloom (UnrealBloomPass) 中心のポストエフェクト合成。
 * RenderPass → UnrealBloomPass → OutputPass の順で、加算ブレンドされた粒子の
 * 明部だけが滲んで「花火らしい」発光感を作る。
 *
 * Tier による強度スケール:
 *   low  → 0.6 (フレーム予算維持を最優先)
 *   mid  → 0.9
 *   high → 1.2 (しっかり滲ませる)
 * Threshold は AdditiveBlending 由来の加算領域を拾えるよう低めに固定 (0.1)。
 */
export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  perf: TierInfo,
): PostFx {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // low tier は bloom をスキップ。UnrealBloomPass は 5 段 downsample/upsample で
  // モバイル最大のコスト源。花火の「らしさ」は落ちるがフレームレート優先。
  let bloom: UnrealBloomPass | null = null;
  if (perf.tier !== "low") {
    const strength =
      perf.tier === "mid" ? BLOOM_STRENGTH_MID : BLOOM_STRENGTH_HIGH;
    bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      strength,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    composer.addPass(bloom);
  }

  // sRGB/トーンマップ整形。これを最後に入れないと色が浅くなる
  composer.addPass(new OutputPass());

  applySize(composer, bloom, window.innerWidth, window.innerHeight, renderer);

  return {
    render() {
      composer.render();
    },
    setSize(width, height) {
      applySize(composer, bloom, width, height, renderer);
    },
  };
}

function applySize(
  composer: EffectComposer,
  bloom: UnrealBloomPass | null,
  width: number,
  height: number,
  renderer: THREE.WebGLRenderer,
): void {
  // Bloom は多段 downsample/upsample で pixel 数に線形以上のコスト。
  // retina で device pixel 100% を走らせると iPhone で破綻する。
  // CSS pixel 100% (pr=1) にクランプすると bloom 処理量が 1/4 になり、
  // 元々ぼかす処理なので見た目のソフト化はほぼ気にならない。
  const pr = Math.min(renderer.getPixelRatio(), 1);
  composer.setPixelRatio(pr);
  composer.setSize(width, height);
  bloom?.setSize(width, height);
}
