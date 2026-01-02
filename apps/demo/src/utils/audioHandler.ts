// apps/demo/src/utils/audioHandler.ts

import { AudioConfig } from "./deviceDetection";
import {
  resample16kTo24k,
  decodeBase64ToPCM16,
  pcmToBase64,
  concatenateArrays,
  createSilence,
  calculateBufferSize,
} from "./audioProcessing";

export interface AudioHandlerCallbacks {
  onSendAudio: (audioBase64: string) => void;
  onError?: (error: Error) => void;
}

export class AudioHandler {
  private config: AudioConfig;
  private callbacks: AudioHandlerCallbacks;

  // Buffer de chunks acumulados
  private audioBuffer: Int16Array[] = [];

  // Estado del handler
  private hasSentInitial: boolean = false;
  private lastChunkTime: number = 0;
  private lastInterruptTime: number = 0;

  // Timers
  private initialDelayTimer: NodeJS.Timeout | null = null;
  private gapDetectionTimer: NodeJS.Timeout | null = null;

  constructor(config: AudioConfig, callbacks: AudioHandlerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /**
   * Maneja un chunk de audio de ElevenLabs
   * @param chunkBase64 Audio en base64 PCM 16kHz
   */
  public handleChunk(chunkBase64: string): void {
    const now = Date.now();

    // 1. Filtrar ghost chunks (post-interrupción)
    const GHOST_DEBOUNCE_MS = 300;
    if (now - this.lastInterruptTime < GHOST_DEBOUNCE_MS) {
      console.log("[AudioHandler] Ignorando ghost chunk");
      return;
    }

    // 2. Decode base64 → Int16Array PCM 16kHz
    const pcm16k = decodeBase64ToPCM16(chunkBase64);

    // 3. Resample 16kHz → 24kHz
    const pcm24k = resample16kTo24k(pcm16k);

    // 4. Acumular en buffer
    this.audioBuffer.push(pcm24k);
    this.lastChunkTime = now;

    const isFirstChunk = this.audioBuffer.length === 1;
    const bufferSize = calculateBufferSize(this.audioBuffer);

    console.log(
      `[AudioHandler] Chunk acumulado: ${this.audioBuffer.length} chunks, ${bufferSize} bytes`,
    );

    // 5. FASE INICIAL: Delay para acumular suficiente audio
    if (isFirstChunk && !this.hasSentInitial) {
      console.log(
        `[AudioHandler] PHASE 1: Iniciando delay de ${this.config.initialDelay}ms`,
      );

      this.initialDelayTimer = setTimeout(() => {
        if (this.audioBuffer.length > 0) {
          console.log(
            `[AudioHandler] PHASE 1: Enviando ${this.audioBuffer.length} chunks después de delay`,
          );
          this.sendAudio(true, false); // con leading silence
          this.hasSentInitial = true;
        }
      }, this.config.initialDelay);

      return;
    }

    // 6. PROTECCIÓN DE LÍMITE: Buffer muy grande
    if (bufferSize >= this.config.maxBufferSize) {
      console.log(`[AudioHandler] Buffer limit alcanzado: ${bufferSize} bytes`);

      // Cancelar delay inicial si aún está activo
      if (this.initialDelayTimer) {
        clearTimeout(this.initialDelayTimer);
        this.initialDelayTimer = null;
      }

      this.sendAudio(false, false); // sin silencios extra
      return;
    }

    // 7. GAP DETECTION: Fin de respuesta
    this.startGapDetection();
  }

  /**
   * Maneja una interrupción del usuario
   */
  public handleInterrupt(): void {
    console.log("[AudioHandler] Usuario interrumpió");

    // 1. Limpiar buffer
    this.audioBuffer = [];
    this.hasSentInitial = false;
    this.lastInterruptTime = Date.now();

    // 2. Cancelar timers
    if (this.initialDelayTimer) {
      clearTimeout(this.initialDelayTimer);
      this.initialDelayTimer = null;
    }

    if (this.gapDetectionTimer) {
      clearTimeout(this.gapDetectionTimer);
      this.gapDetectionTimer = null;
    }
  }

  /**
   * Resetea el handler (para nueva conversación)
   */
  public reset(): void {
    this.audioBuffer = [];
    this.hasSentInitial = false;
    this.lastChunkTime = 0;
    this.lastInterruptTime = 0;

    if (this.initialDelayTimer) clearTimeout(this.initialDelayTimer);
    if (this.gapDetectionTimer) clearTimeout(this.gapDetectionTimer);
  }

  /**
   * Inicia/reinicia gap detection
   */
  private startGapDetection(): void {
    // Limpiar timer anterior
    if (this.gapDetectionTimer) {
      clearTimeout(this.gapDetectionTimer);
    }

    this.gapDetectionTimer = setTimeout(() => {
      if (this.audioBuffer.length > 0) {
        console.log(
          `[AudioHandler] Gap detectado: ${this.config.gapThreshold}ms sin chunks`,
        );
        this.sendAudio(false, true); // con trailing silence
      }
    }, this.config.gapThreshold);
  }

  /**
   * Envía audio acumulado a HeyGen
   */
  private sendAudio(withLeading: boolean, withTrailing: boolean): void {
    if (this.audioBuffer.length === 0) {
      console.warn("[AudioHandler] Buffer vacío, nada que enviar");
      return;
    }

    try {
      // 1. Concatenar todos los chunks
      const combined = concatenateArrays(this.audioBuffer);

      // 2. Agregar silencios si es necesario
      let final = combined;

      if (withLeading) {
        const leadingSilence = createSilence(this.config.leadingSilence);
        final = concatenateArrays([leadingSilence, combined]);
        console.log(
          `[AudioHandler] Agregando ${this.config.leadingSilence}ms leading silence`,
        );
      }

      if (withTrailing) {
        const trailingSilence = createSilence(this.config.trailingSilence);
        final = concatenateArrays([final, trailingSilence]);
        console.log(
          `[AudioHandler] Agregando ${this.config.trailingSilence}ms trailing silence`,
        );
      }

      // 3. Convertir a base64
      const base64Audio = pcmToBase64(final);

      // 4. Enviar a HeyGen
      const durationSeconds = (final.length / 24000).toFixed(2);
      console.log(
        `[AudioHandler] Enviando ${final.length} samples (${durationSeconds}s) a HeyGen`,
      );

      this.callbacks.onSendAudio(base64Audio);

      // 5. Limpiar buffer
      this.audioBuffer = [];

      // 6. Limpiar timers
      if (this.initialDelayTimer) {
        clearTimeout(this.initialDelayTimer);
        this.initialDelayTimer = null;
      }

      if (this.gapDetectionTimer) {
        clearTimeout(this.gapDetectionTimer);
        this.gapDetectionTimer = null;
      }
    } catch (error) {
      console.error("[AudioHandler] Error enviando audio:", error);
      this.callbacks.onError?.(error as Error);
    }
  }
}
