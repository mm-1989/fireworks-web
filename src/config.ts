/**
 * 全モジュール共通の調整パラメータを集約する。
 * マジックナンバーはこのファイルに一元化し、挙動の調整ポイントを見通せるようにする。
 */

// ---- Scene / Camera ----
export const CAMERA_FOV = 60;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 1000;
export const CAMERA_Z = 50;
/**
 * 端末 pixelRatio の上限。retina (2 以上) で 1 引き下げると pixel 数が 44% 減で
 * fragment/帯域コストを大きく下げられる。花火は細部よりにじみ重視なので、
 * 1.5 程度で細部精度を維持しつつモバイル負荷を抑える。
 */
export const MAX_PIXEL_RATIO = 1.5;

// ---- Animation loop ----
export const DT_MAX = 0.05; // フレーム遅延時の異常な速度倍加を防ぐ上限

// ---- Post-processing (UnrealBloomPass) ----
/**
 * トーンマッピング導入後は、AdditiveBlending の合算輝度も OutputPass で
 * ACESFilmic により非線形圧縮される。それでもなお明部の滲みだけ拾いたいので
 * しきい値は中程度に。
 */
export const BLOOM_THRESHOLD = 0.55;
/** ブルームの広がり半径 (0..1)。上げるほど滲みが太い */
export const BLOOM_RADIUS = 0.45;
/**
 * Tier 別の bloom 強度。内部的に 3x 倍率がかかる (UnrealBloomPass 仕様) ので
 * 体感の強さは 3 倍で考えるとよい。
 */
export const BLOOM_STRENGTH_LOW = 0.18;
export const BLOOM_STRENGTH_MID = 0.28;
export const BLOOM_STRENGTH_HIGH = 0.38;

// ---- Charge (長押しチャージ) ----
/** 1 段階あたりの保持時間 (ms)。10 段階で 1500ms = 最大溜め */
export const CHARGE_STEP_MS = 150;
/** 最大段階。タップ離し時にこの値までで burst スケールが決まる */
export const CHARGE_MAX_STEPS = 10;
/** 押下位置から指がこの距離 (px) を越えたらチャージを中断 (Phase C スワイプ用) */
export const CHARGE_MOVE_CANCEL_PX = 12;

// ---- Charge aura (押下位置を渦巻く粒子) ----
/** 同時存在する aura 粒子数 */
export const CHARGE_AURA_MAX = 120;
/** aura の外周半径 (world)。粒子はここから吸い込まれていく */
export const CHARGE_AURA_OUTER_R = 5;
/** 外周ジッタ。各粒子の spawn 半径は OUTER_R..OUTER_R+JITTER */
export const CHARGE_AURA_OUTER_R_JITTER = 2;

// ---- Residue sparkle (焼き付けの上で常時キラキラする overlay) ----
/** 同時に生きている sparkle 粒子の上限 (スロット数) */
export const RESIDUE_SPARKLE_MAX = 100;
/** sparkle 寿命の乱数下限/上限 (秒)。粒子ごとに区間内でランダム */
export const RESIDUE_SPARKLE_LIFE_MIN = 0.7;
export const RESIDUE_SPARKLE_LIFE_MAX = 1.6;
/** residue の明度マップを再取得する周期 (秒) */
export const RESIDUE_SPARKLE_MAP_REFRESH_SEC = 0.3;
/** 低解像度サンプル (正方形)。大きいほど細かく spawn 位置が拾えるが getImageData コスト増 */
export const RESIDUE_SPARKLE_SAMPLE_SIZE = 64;
/** 明部判定の閾値 (0..255)。(r+g+b)/3 がこの値以上のピクセルを spawn 候補に入れる */
export const RESIDUE_SPARKLE_BRIGHT_THRESHOLD = 40;
/** 粒子サイズ (world)。小粒で多数がキラキラ感を出す */
export const RESIDUE_SPARKLE_SIZE = 1.1;
/** spawn 時にサンプル中心から world 単位でぶらす距離 */
export const RESIDUE_SPARKLE_JITTER_WORLD = 0.8;
/** 死んだスロットが毎フレーム再生成を試みる確率。低いほど点滅がまばらになる */
export const RESIDUE_SPARKLE_RESPAWN_CHANCE = 0.12;

// ---- Shooting star (スワイプで出る流れ星) ----
export const SHOOTING_STAR_HEAD_SIZE = 4.0;
export const SHOOTING_STAR_TRAIL_SIZE = 2.2;
export const SHOOTING_STAR_TRAIL_MAX = 20;
export const SHOOTING_STAR_TRAIL_FADE_PER_SEC = 4.0;
export const SHOOTING_STAR_LIFETIME = 0.8;
/** residue に焼き付けるときの world 単位の見かけサイズ */
export const SHOOTING_STAR_STAMP_WORLD_SIZE = 3.0;

// ---- Swipe (スワイプ → 流れ星) ----
/** スワイプ距離 (px) から本数に換算するレート。40px ごとに 1 本 */
export const SWIPE_STARS_PER_PX = 1 / 40;
/** 1 回のスワイプで出せる最大本数 */
export const SWIPE_STARS_MAX = 20;
/** 流れ星の最低/最高速度 (world/s)。速度クランプ用 */
export const SWIPE_SPEED_MIN_WORLD = 20;
export const SWIPE_SPEED_MAX_WORLD = 120;
/** 同時に生存できる流れ星の上限 */
export const SHOOTING_STARS_MAX_CONCURRENT = 40;
/** スワイプ速度サンプルを取る期間 (ms)。長すぎると古い動きが混じり、短すぎるとノイジー */
export const SWIPE_VELOCITY_WINDOW_MS = 150;

// ---- Residue cross rays (焼き付けと並走して回転/拡縮する十字 ray) ----
/**
 * 同時に維持する十字粒子の上限。円環バッファで古いものから上書き。
 * burst 粒子 1 個につき 1 回 addAt するわけではなく SUB_SAMPLE で間引くので、
 * このキャパでも数十バーストぶんの痕跡が残せる。
 */
export const RESIDUE_CROSS_MAX = 1500;
/**
 * 十字粒子の world 単位サイズ (PointsMaterial.size)。焼き付け core 半径より一回り
 * 大きめに取り、十字の腕が residue より外側に伸びて視認できるようにする。
 * これより小さいと arm が core に埋もれて見えづらい。
 */
export const RESIDUE_CROSS_SIZE = 10.0;
/**
 * burst stamp 時に何粒子おきに十字を spawn するか。1 なら全粒子、4 なら 1/4。
 * 間引くことで MAX スロットをすぐに使い切らず、長時間の焼き付け痕跡が残る。
 */
export const RESIDUE_CROSS_BURST_SUB_SAMPLE = 10;

// ---- Residue (焼き付け背景) ----
/** 1 粒子当たりの焼き付け不透明度。同じ場所に重ねるほど濃くなる */
export const RESIDUE_ALPHA = 0.5;
/** 視覚サイズに対する stamp 半径の倍率。1.0 = 画面上で粒子が見えている領域と同じ */
export const RESIDUE_RADIUS_SCALE = 1.0;
/** burst の寿命比率がこの値を跨いだ瞬間に residue へ焼き付ける */
export const STAMP_LIFE_RATIO = 0.7;
/** 同時に存在できる burst の上限。溢れた最古の burst は即時焼き付け+破棄 */
export const MAX_CONCURRENT_BURSTS = 5;

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
