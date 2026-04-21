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
 * sparkle パッチの振幅オプション。short-lived な粒子 (default) では控えめでも
 * 十分キラキラするが、長寿命の粒子 (residueCrosses 等) では同じ値だと静的に
 * 見えてしまうので呼び出し側で上げる。
 */
export interface SparklePatchOptions {
  /** scalePulse の振幅。0.18 → 0.82..1.18 (36%)、0.4 → 0.6..1.4 (80%) */
  scalePulseAmp?: number;
  /** scalePulse の角速度 (rad/s)。2.8 → 2.24s 周期 */
  scalePulseHz?: number;
  /** flicker の振幅。0.12 → 0.88..1.0、0.3 → 0.7..1.0 */
  flickerAmp?: number;
  /** rotation 基礎速度 (rad/s)。粒子ごとに [base, base+spread] でばらつく */
  rotSpeedBase?: number;
  rotSpeedSpread?: number;
  /**
   * alpha を `map.a * brightness` にクランプするか (default true)。
   *
   * true (default): core を持つ glow 向け。bright 中心が alpha に追従し、dim RGB +
   *   high alpha の「residue 黒穴」を防げる。ただし ray-only テクスチャだと ray 腕で
   *   低 α × 低明度が二乗に効いて arm が完全に消える。
   *
   * false: ray-only 粒子向け。map の α そのままを出力。arm がちゃんと見える代わりに
   *   源色が暗くて α が高い pixel では residue 下地をわずかに dim する副作用が出る。
   */
  alphaFollowsBrightness?: boolean;
}

/**
 * PointsMaterial に UV 回転 + 拡縮 + 明度フリッカを注入する onBeforeCompile パッチ。
 *
 * 前提: geometry に `seed` (Float32Array, itemSize=1, 0..1 の乱数) attribute が必要。
 *
 * 挙動:
 *  - UV 回転: 粒子ごとに rotSpeed で座標系を回す (+ seed で方向反転)
 *  - scalePulse: uTime で UV を中心方向へ拡縮して十字が呼吸する
 *  - 明度フリッカ: sin(uTime*4 + seed*TAU) で 0.88..1.0 を揺らす
 *  - 外接円クランプ: length(gl_PointCoord - 0.5) > 0.5 の四隅は α=0
 *
 * alpha ポリシー (alphaFollowsBrightness): 既定 true で `diffuseColor.a * max(tinted.rgb)`。
 *  - scene canvas (WebGL, 透過) は下の 2D residue canvas に source-over で合成される。
 *    RGB が暗いのに alpha が高い pixel は「residue を黒く抜く穴」として見える。
 *  - Additive blending で粒子が重なると framebuffer の alpha が蓄積しやすい。
 *  - max(rgb) に追従させれば flicker / vertex color フェード / opacity フェードが
 *    全て alpha に伝搬する。ray-only テクスチャでは腕の低明度が二乗で消えるため false に。
 *
 * 既存 onBeforeCompile は尊重して連鎖する (上書きしない)。ただし `#include <opaque_fragment>`
 * を書き換える別パッチと同居はできない (置換対象が消える)。
 */
export function applySparklePatch(
  material: THREE.PointsMaterial,
  opts: SparklePatchOptions = {},
): void {
  const scaleAmp = opts.scalePulseAmp ?? 0.18;
  const scaleHz = opts.scalePulseHz ?? 2.8;
  const flickerAmp = opts.flickerAmp ?? 0.12;
  const flickerBase = 1.0 - flickerAmp;
  const rotBase = opts.rotSpeedBase ?? 0.15;
  const rotSpread = opts.rotSpeedSpread ?? 0.35;
  const alphaExpr =
    opts.alphaFollowsBrightness === false
      ? "diffuseColor.a"
      : "diffuseColor.a * brightness";

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
      // (= 慣性を感じるばらけ)。さらに低周波 scalePulse で UV 中心方向への拡縮を
      // 入れ、十字が呼吸する。
      //  - scalePulse < 1.0 → 中心寄りをサンプル = テクスチャ拡大 (十字が伸びる)
      //  - scalePulse > 1.0 → 端寄りをサンプル = テクスチャ縮小 (十字が引っ込む)
      // 回転後の UV が [0,1] を超えると clamp-to-edge で端 (alpha=0) を拾うが、
      // glow テクスチャ自体が縁で透明なので穴は出ない。
      // 軽量化: wobble (1 sin) を削除。rotSpeed の seed ばらけで十分揺らいで見える。
      .replace(
        "#include <map_particle_fragment>",
        `
        float rotDir = (vSeed > 0.5) ? 1.0 : -1.0;
        float rotSpeed = ${rotBase.toFixed(3)} + fract(vSeed * 13.37) * ${rotSpread.toFixed(3)};
        float rotAngle = uTime * rotSpeed * rotDir + vSeed * 6.2831853;
        float rc = cos(rotAngle);
        float rs = sin(rotAngle);
        float scalePulse = 1.0 + ${scaleAmp.toFixed(3)} * sin(uTime * ${scaleHz.toFixed(3)} + vSeed * 6.2831853 + 1.3);
        vec2 centered = gl_PointCoord - 0.5;
        vec2 rotCoord = (mat2(rc, -rs, rs, rc) * centered) * scalePulse + 0.5;
        // quad の四隅 (length(centered) > 0.5) では、scalePulse < 1.0 のとき
        // rotCoord が テクスチャ中央 (bright core) を指してしまい、本来暗いはず
        // の四隅が bright 値で塗られて矩形フチが浮く。テクスチャは実質円形なので
        // 外接円の外側は無条件にα=0 にして sprite を円形化する。
        float inCircle = step(length(centered), 0.5);
        #if defined( USE_MAP ) || defined( USE_ALPHAMAP )
          vec2 uv = ( uvTransform * vec3( rotCoord.x, 1.0 - rotCoord.y, 1.0 ) ).xy;
        #endif
        #ifdef USE_MAP
          diffuseColor *= texture2D( map, uv );
        #endif
        #ifdef USE_ALPHAMAP
          diffuseColor.a *= texture2D( alphaMap, uv ).g;
        #endif
        diffuseColor.a *= inCircle;
        `,
      )
      .replace(
        "#include <opaque_fragment>",
        `
        // flicker は常に 1.0 以下。baseline より明るくはしない。
        // 軽量化: 旧版は RGB 独立 hueTint で 3 sin 追加していたが、色味の揺らぎは
        // vertex color の分散 + flicker で十分認知できるため廃止 (3 sin 節約)。
        float flicker = ${flickerBase.toFixed(3)} + ${flickerAmp.toFixed(3)} * sin(uTime * 4.0 + vSeed * 6.2831853);
        vec3 tinted = outgoingLight * flicker;
        float brightness = max(max(tinted.r, tinted.g), tinted.b);
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
