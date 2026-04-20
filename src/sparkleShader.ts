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
 *  - 明度フリッカ: sin(uTime*4 + seed*TAU) で 0.88..1.0 を揺らす
 *  - RGB 各チャネル独立の低周波 (0.5-0.7 Hz) で色相がじんわり回る
 *
 * alpha ポリシー: 常に `diffuseColor.a * max(tinted.rgb)` に追従させる。
 *  - scene canvas (WebGL, 透過) は下の 2D residue canvas に source-over で合成される。
 *    RGB が暗いのに alpha が高い pixel は「residue を黒く抜く穴」として見える。
 *  - Additive blending で粒子が重なると framebuffer の alpha が蓄積しやすく、この穴は
 *    たくさんの粒子が重なるほど深くなる (trail で以前起きた黒飛びと同構造)。
 *  - max(rgb) に追従させれば flicker の明暗・vertex color フェード・opacity フェードの
 *    全てが自然に alpha に伝搬する。
 *
 * 既存 onBeforeCompile は尊重して連鎖する (上書きしない)。ただし `#include <opaque_fragment>`
 * を書き換える別パッチと同居はできない (置換対象が消える)。
 */
export function applySparklePatch(material: THREE.PointsMaterial): void {
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

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        "uniform float uTime;\nvarying float vSeed;\nvoid main() {",
      )
      // map_particle_fragment を差し替え、gl_PointCoord を粒子ごとの角度で回す。
      // 角速度・方向を seed で散らすことで、粒子が各自のペースで自然に回る
      // (= 慣性を感じるばらけ)。低周波 wobble を加えてわずかに揺らぎを与える。
      // 回転後の UV が [0,1] を超えると clamp-to-edge で端 (alpha=0) を拾うが、
      // glow テクスチャ自体が縁で透明なので穴は出ない。
      .replace(
        "#include <map_particle_fragment>",
        `
        float rotDir = (vSeed > 0.5) ? 1.0 : -1.0;
        float rotSpeed = 0.4 + fract(vSeed * 13.37) * 0.9;
        float wobble = 0.18 * sin(uTime * 0.35 + vSeed * 6.2831853);
        float rotAngle = uTime * rotSpeed * rotDir + wobble + vSeed * 6.2831853;
        float rc = cos(rotAngle);
        float rs = sin(rotAngle);
        vec2 rotCoord = mat2(rc, -rs, rs, rc) * (gl_PointCoord - 0.5) + 0.5;
        #if defined( USE_MAP ) || defined( USE_ALPHAMAP )
          vec2 uv = ( uvTransform * vec3( rotCoord.x, 1.0 - rotCoord.y, 1.0 ) ).xy;
        #endif
        #ifdef USE_MAP
          diffuseColor *= texture2D( map, uv );
        #endif
        #ifdef USE_ALPHAMAP
          diffuseColor.a *= texture2D( alphaMap, uv ).g;
        #endif
        `,
      )
      .replace(
        "#include <opaque_fragment>",
        `
        float phase = uTime + vSeed * 6.2831853;
        // flicker は常に 1.0 以下。baseline より明るくはしない。
        float flicker = 0.88 + 0.12 * sin(uTime * 4.0 + vSeed * 6.2831853);
        vec3 hueTint = vec3(
          0.94 + 0.06 * sin(phase * 0.7),
          0.94 + 0.06 * sin(phase * 0.5 + 2.0),
          0.94 + 0.06 * sin(phase * 0.6 + 4.0)
        );
        vec3 tinted = outgoingLight * hueTint * flicker;
        float brightness = max(max(tinted.r, tinted.g), tinted.b);
        gl_FragColor = vec4(tinted, diffuseColor.a * brightness);
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
