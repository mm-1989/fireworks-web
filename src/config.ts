/**
 * 全モジュール共通の調整パラメータを集約する。
 * マジックナンバーはこのファイルに一元化し、挙動の調整ポイントを見通せるようにする。
 */

// ---- Scene / Camera ----
export const CAMERA_FOV = 60;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 1000;
export const CAMERA_Z = 50;
export const BACKGROUND_COLOR = 0x000010;
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
