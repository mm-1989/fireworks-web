/**
 * 効果音を Web Audio API で完全合成する (音声ファイル不要)。
 *
 * iOS Safari制約: AudioContext はユーザ操作イベント内で初めて再生可能。
 * このため `ensureContext()` を最初のタップで呼ぶ必要がある。
 */

// 古い Safari 用の prefixed AudioContext を型安全に取り出す
interface WindowWithWebkitAudio extends Window {
  readonly webkitAudioContext?: typeof AudioContext;
}
function getWebkitAudioContext(): typeof AudioContext | undefined {
  return (window as WindowWithWebkitAudio).webkitAudioContext;
}

export class SoundManager {
  private ctx: AudioContext | null = null;

  /** 最初のユーザ操作で呼ぶこと。iOSの自動再生制限を解除する */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext ?? getWebkitAudioContext();
      if (!AC) throw new Error("AudioContext is not supported in this browser");
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /** 打ち上げ音「ヒュー…」: 上昇する純音 + 下降する倍音 */
  playLaunch(durationSec = 0.7): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(
      1200,
      now + durationSec * 0.9,
    );

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec);
  }

  /** 炸裂音「パン!」: ノイズバースト + ローパス + 短い残響 */
  playExplosion(): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const duration = 0.6;

    // ホワイトノイズバッファ生成
    const sampleRate = ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // 時間経過でフェード (エクスポネンシャルdecay)
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.6);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // ローパスで「ドン」感を作る。カットオフを時間で下げると低音が残る
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2200, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + duration);
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
  }
}
