// apps/demo/src/utils/audioPlayback.ts

interface WindowWithAudioContext extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Sistema de cola de audio para reproducir chunks sin overlapping
 * ElevenLabs envía múltiples eventos "audio", necesitamos encolarlos
 */
export class AudioPlaybackQueue {
  private audioContext: AudioContext | null = null;
  private queue: AudioBuffer[] = [];
  private isPlaying: boolean = false;
  private currentSource: AudioBufferSourceNode | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      const win = window as WindowWithAudioContext;
      const AudioContextClass = win.AudioContext || win.webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
      }
    }
  }

  /**
   * Agrega un chunk de audio a la cola
   * @param audioBase64 Audio en base64 PCM 16kHz
   */
  public async enqueue(audioBase64: string): Promise<void> {
    if (!this.audioContext) {
      console.error("[AudioPlayback] AudioContext no disponible");
      return;
    }

    try {
      // 1. Decode base64 → ArrayBuffer
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 2. PCM 16kHz 16-bit mono → AudioBuffer
      const pcm16 = new Int16Array(bytes.buffer);
      const audioBuffer = this.audioContext.createBuffer(
        1, // 1 canal (mono)
        pcm16.length,
        16000, // 16kHz sample rate
      );

      // 3. Convertir Int16 a Float32 (Web Audio API usa Float32)
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < pcm16.length; i++) {
        channelData[i] = (pcm16[i] ?? 0) / 32768.0; // Normalize to [-1, 1]
      }

      // 4. Agregar a cola
      this.queue.push(audioBuffer);

      // 5. Iniciar playback si no está tocando
      if (!this.isPlaying) {
        this.playNext();
      }
    } catch (error) {
      console.error("[AudioPlayback] Error encolando audio:", error);
    }
  }

  /**
   * Reproduce el siguiente chunk de la cola
   */
  private async playNext(): Promise<void> {
    if (!this.audioContext || this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.queue.shift()!;

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    source.onended = () => {
      this.currentSource = null;
      this.playNext(); // Reproducir siguiente en cola
    };

    this.currentSource = source;
    source.start(0);
  }

  /**
   * Detiene la reproducción actual y limpia la cola
   */
  public stop(): void {
    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }
    this.queue = [];
    this.isPlaying = false;
  }

  /**
   * Limpia solo la cola (sin detener playback actual)
   */
  public clearQueue(): void {
    this.queue = [];
  }
}
