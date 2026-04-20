/**
 * クリア達成時の演出。
 * residue canvas を画像化した「作品」を額縁風の枠に表示し、称賛メッセージと
 * 「ほぞん」「もういちど」ボタンを出す。
 *
 * 画像データと保存/再スタートのハンドラは main.ts 側から渡す。
 * (保存は Web Share API 優先でフォールバックするが、その判定は呼び出し側)
 */

const PRAISE_MESSAGES = [
  "よくできました！",
  "すてきな はなびだね",
  "はなびいっぱい！",
  "じょうずだね！",
];

export interface ClearCeremonyHandlers {
  /** 「ほぞん」押下時。Promise 解決まではボタンを無効化する */
  onSave(): Promise<void> | void;
  /** 「もういちど」押下時。呼び出し後に overlay は自動で撤去される */
  onRestart(): void;
}

/** 開いていた ceremony overlay があれば閉じる */
export function dismissClearCeremony(): void {
  document.getElementById("clear-ceremony")?.remove();
}

export function showClearCeremony(
  imageDataUrl: string,
  handlers: ClearCeremonyHandlers,
): void {
  dismissClearCeremony();

  const overlay = document.createElement("div");
  overlay.id = "clear-ceremony";
  overlay.className = "clear-ceremony";

  const praise = document.createElement("div");
  praise.className = "clear-ceremony__praise";
  praise.textContent =
    PRAISE_MESSAGES[Math.floor(Math.random() * PRAISE_MESSAGES.length)];

  const frame = document.createElement("div");
  frame.className = "clear-ceremony__frame";

  const img = document.createElement("img");
  img.className = "clear-ceremony__image";
  img.src = imageDataUrl;
  img.alt = "はなびの さくひん";
  frame.appendChild(img);

  const actions = document.createElement("div");
  actions.className = "clear-ceremony__actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "clear-ceremony__btn clear-ceremony__btn--save";
  saveBtn.textContent = "ほぞん";
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      await handlers.onSave();
    } finally {
      saveBtn.disabled = false;
    }
  });

  const restartBtn = document.createElement("button");
  restartBtn.type = "button";
  restartBtn.className = "clear-ceremony__btn clear-ceremony__btn--restart";
  restartBtn.textContent = "もういちど";
  restartBtn.addEventListener("click", () => {
    dismissClearCeremony();
    handlers.onRestart();
  });

  actions.appendChild(saveBtn);
  actions.appendChild(restartBtn);

  overlay.appendChild(praise);
  overlay.appendChild(frame);
  overlay.appendChild(actions);
  document.body.appendChild(overlay);
}
