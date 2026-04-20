import * as THREE from "three";

/**
 * 粒子シェーダ用の共有時間 uniform。
 * animate ループで毎フレーム value を更新すると、applySparklePatch で束ねた
 * 全マテリアルに同じ時間が伝搬する。参照共有なので、材料ごとの個別更新は不要。
 */
export const sparkleUniforms = {
  uTime: { value: 0 },
};

/**
 * PointsMaterial に「常時キラキラ + 低速グラデ」を注入する onBeforeCompile パッチ。
 *
 * 前提: geometry に `seed` (Float32Array, itemSize=1, 0..1 の乱数) attribute が必要。
 *
 * 挙動:
 *  - 明度フリッカ: sin(uTime*7 + seed*TAU) で 0.75..1.0 を高速揺らし
 *  - RGB 各チャネル独立の低周波 (0.5-0.7 Hz 程度) で色相がじんわり回る
 *    (YIQ 空間で正しい hue 回転をするよりずっと安く、見た目はほぼ同等)
 *  - alphaMode = "brightness" なら最終 alpha を出力 RGB の最大チャネルに追従させる。
 *    シューティングスターの trail のように vertex color が 0 まで落ちても、下の
 *    residue を黒く抜いてしまわないようにするため。
 *
 * 既存 onBeforeCompile は尊重して連鎖する (上書きしない)。ただし `#include <opaque_fragment>`
 * を書き換える別パッチと同居はできない (置換対象が消える) ので、trail の alpha 挙動は
 * こちらに吸収する設計にしている。
 */
export function applySparklePatch(
  material: THREE.PointsMaterial,
  alphaMode: "normal" | "brightness" = "normal",
): void {
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prior) prior.call(material, shader, renderer);

    shader.uniforms.uTime = sparkleUniforms.uTime;

    // vertex: seed を varying で渡す
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        "attribute float seed;\nvarying float vSeed;\nvoid main() {",
      )
      .replace(/}\s*$/, "  vSeed = seed;\n}");

    // flicker で RGB だけ落ちると scene→residue の source-over 合成で
    // 黒い穴として抜けるため、alpha も flicker に追従させる。
    // "brightness" モードは trail 用: vertex color のフェードが alpha に載らないので
    // 出力 RGB の最大値で alpha を決める (これで flicker も自然に反映される)。
    const alphaExpr =
      alphaMode === "brightness"
        ? "diffuseColor.a * max(max(tinted.r, tinted.g), tinted.b)"
        : "diffuseColor.a * flicker";

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        "uniform float uTime;\nvarying float vSeed;\nvoid main() {",
      )
      .replace(
        "#include <opaque_fragment>",
        `
        float phase = uTime + vSeed * 6.2831853;
        // フリッカは常に 1.0 以下に留める (baseline より明るくはしない)。
        // 振幅を抑えた方が bloom との重なりで白飛びが暴れない。
        float flicker = 0.88 + 0.12 * sin(uTime * 4.0 + vSeed * 6.2831853);
        vec3 hueTint = vec3(
          0.94 + 0.06 * sin(phase * 0.7),
          0.94 + 0.06 * sin(phase * 0.5 + 2.0),
          0.94 + 0.06 * sin(phase * 0.6 + 4.0)
        );
        vec3 tinted = outgoingLight * hueTint * flicker;
        gl_FragColor = vec4(tinted, ${alphaExpr});
        `,
      );
  };
  material.needsUpdate = true;
}

/** count 個の 0..1 乱数シードを持つ BufferAttribute を作る */
export function createSeedAttribute(count: number): THREE.BufferAttribute {
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  return new THREE.BufferAttribute(seeds, 1);
}
