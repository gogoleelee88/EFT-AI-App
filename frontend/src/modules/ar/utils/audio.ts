export class TTSService {
  private synthesis: SpeechSynthesis | null;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.synthesis =
      typeof window !== 'undefined' && 'speechSynthesis' in window
        ? window.speechSynthesis ?? null
        : null;
    this.initVoice();
  }

  private initVoice(): void {
    if (!this.synthesis) return;

    const voices = (() => {
      try {
        return this.synthesis?.getVoices() ?? [];
      } catch {
        return [];
      }
    })();

    this.voice =
      voices.find((voice) => voice.lang.startsWith('ko') && voice.name.includes('Korean')) ||
      voices.find((voice) => voice.lang.startsWith('ko')) ||
      voices[0] ||
      null;

    if (!this.voice && voices.length === 0) {
      this.synthesis.addEventListener(
        'voiceschanged',
        () => {
          this.initVoice();
        },
        { once: true },
      );
    }
  }

  speak(text: string, options?: { rate?: number; pitch?: number; volume?: number }): void {
    if (!this.synthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      return;
    }

    this.synthesis.cancel();

    if (!text.trim()) return;

    const utterance = new SpeechSynthesisUtterance(text);

    if (this.voice) {
      utterance.voice = this.voice;
    }

    utterance.rate = options?.rate || 0.9;
    utterance.pitch = options?.pitch || 1.0;
    utterance.volume = options?.volume || 0.8;
    utterance.lang = 'ko-KR';

    this.synthesis.speak(utterance);
  }

  stop(): void {
    if (!this.synthesis) return;
    this.synthesis.cancel();
  }

  get isSupported(): boolean {
    return this.synthesis != null && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  get isSpeaking(): boolean {
    return this.synthesis?.speaking ?? false;
  }
}

export const ttsService = new TTSService();
