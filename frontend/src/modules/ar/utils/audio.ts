export class TTSService {
  private synthesis: SpeechSynthesis;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.synthesis = window.speechSynthesis;
    this.initVoice();
  }

  private initVoice(): void {
    const voices = this.synthesis.getVoices();
    
    // 한국어 음성 찾기
    this.voice = voices.find(voice => 
      voice.lang.startsWith('ko') && voice.name.includes('Korean')
    ) || voices.find(voice => voice.lang.startsWith('ko')) || voices[0] || null;

    // 음성이 로드되지 않았다면 이벤트 리스너 등록
    if (!this.voice && voices.length === 0) {
      this.synthesis.addEventListener('voiceschanged', () => {
        this.initVoice();
      }, { once: true });
    }
  }

  speak(text: string, options?: { rate?: number; pitch?: number; volume?: number }): void {
    // 기존 음성 중단
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
    this.synthesis.cancel();
  }

  get isSupported(): boolean {
    return 'speechSynthesis' in window;
  }

  get isSpeaking(): boolean {
    return this.synthesis.speaking;
  }
}

export const ttsService = new TTSService();