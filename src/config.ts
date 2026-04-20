/**
 * 全モジュール共通の調整パラメータを集約する。
 * マジックナンバーはこのファイルに一元化し、挙動の調整ポイントを見通せるようにする。
 */

// ---- Scene / Camera ----
export const CAMERA_FOV = 60;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 1000;
export const CAMERA_Z = 50;
export const MAX_PIXEL_RATIO = 2;

// ---- Rocket ----
export const ROCKET_SPEED = 55;
export const ROCKET_HEAD_SIZE = 5.0;
export const ROCKET_TRAIL_SIZE = 2.8;
export const ROCKET_TRAIL_MAX = 40;
export const ROCKET_TRAIL_FADE_PER_SEC = 2.5;
export const ROCKET_DEFAULT_COLOR = 0xffaacc;
export const ROCKET_LAUNCH_Y_OFFSET = 3; // 画面下端より更に下から発射

// ---- Animation loop ----
export const DT_MAX = 0.05; // フレーム遅延時の異常な速度倍加を防ぐ上限

// ---- Residue (焼き付け背景) ----
/** 1 粒子当たりの焼き付け不透明度。同じ場所に重ねるほど濃くなる */
export const RESIDUE_ALPHA = 0.5;
/** 視覚サイズに対する stamp 半径の倍率。1.0 = 画面上で粒子が見えている領域と同じ */
export const RESIDUE_RADIUS_SCALE = 1.0;
/** burst の寿命比率がこの値を跨いだ瞬間に residue へ焼き付ける */
export const STAMP_LIFE_RATIO = 0.7;
/** 同時に存在できる burst の上限。溢れた最古の burst は即時焼き付け+破棄 */
export const MAX_CONCURRENT_BURSTS = 8;

// ---- Clear 判定 ----
/**
 * mask 内のこの割合以上が埋まったらクリア (0..1)。
 * 0.99 なら黒残り 1% まで許容 = 視覚上「ほぼ真っ黒なし」
 */
export const CLEAR_FILL_THRESHOLD = 0.99;
/**
 * fill rate 計算時のダウンサンプル解像度 (正方形)。
 * 高いほど小さな黒穴も検出できるが、getImageData コスト増。
 */
export const CLEAR_SAMPLE_SIZE = 128;
/**
 * 明度 (r+g+b)/3 がこれ以上なら「埋まっている」とみなす (0..255)。
 * SAMPLE_SIZE が十分高ければ低めでよい (= stamp が掛かっていれば拾う)。
 */
export const CLEAR_BRIGHT_THRESHOLD = 60;
/** クリア判定の実行周期 (秒) */
export const CLEAR_CHECK_INTERVAL_SEC = 1.0;
