/**
 * クリア時の作品画像を保存するためのユーティリティ。
 * Web Share API 優先 (iOS Safari から写真アプリへ直接保存できる) で、
 * 非対応環境では `<a download>` にフォールバックする。
 */

/** 保存ファイル名を `fireworks-YYYYMMDD-HHMM.png` 形式で生成 */
export function buildFileName(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `fireworks-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}.png`
  );
}

/**
 * data URL を画像として保存。共有シートをユーザがキャンセル (AbortError) した場合は
 * フォールバックしない (誤ってダブルで保存されないように)。
 */
export async function saveImage(
  dataUrl: string,
  fileName: string,
): Promise<void> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName, { type: "image/png" });

    const shareNav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    if (
      typeof navigator.share === "function" &&
      typeof shareNav.canShare === "function" &&
      shareNav.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({ files: [file], title: "はなび" });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // それ以外は下のダウンロードにフォールバック
      }
    }

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error("[save] failed", err);
  }
}
