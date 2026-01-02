// apps/demo/src/utils/audioProcessing.ts

/**
 * Resamplea audio PCM de 16kHz a 24kHz usando interpolación lineal
 * Input: Int16Array @ 16kHz
 * Output: Int16Array @ 24kHz
 */
export function resample16kTo24k(input: Int16Array): Int16Array {
  const ratio = 24000 / 16000; // 1.5
  const outputLength = Math.ceil(input.length * ratio);
  const output = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i / ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
    const t = srcIndex - srcIndexFloor;

    // Interpolación lineal
    const valFloor = input[srcIndexFloor] ?? 0;
    const valCeil = input[srcIndexCeil] ?? 0;
    output[i] = Math.round(valFloor * (1 - t) + valCeil * t);
  }

  return output;
}

/**
 * Decodifica Base64 a Int16Array PCM
 * ElevenLabs envía audio en base64, necesitamos Int16Array para procesar
 */
export function decodeBase64ToPCM16(base64: string): Int16Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Int16Array(bytes.buffer);
}

/**
 * Codifica Int16Array PCM a Base64
 * HeyGen SDK requiere audio en base64
 */
export function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer);
  let binaryString = "";

  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i] ?? 0);
  }

  return btoa(binaryString);
}

/**
 * Concatena múltiples Int16Arrays en uno solo
 * Usado para acumular chunks antes de enviar a HeyGen
 */
export function concatenateArrays(arrays: Int16Array[]): Int16Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Int16Array(totalLength);

  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

/**
 * Crea silencio (zeros) de duración específica @ 24kHz
 * Usado para leading/trailing silence
 */
export function createSilence(
  durationMs: number,
  sampleRate: number = 24000,
): Int16Array {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  return new Int16Array(samples); // Ya inicializado en 0
}

/**
 * Calcula el tamaño en bytes de un array de Int16Arrays
 */
export function calculateBufferSize(arrays: Int16Array[]): number {
  const totalSamples = arrays.reduce((sum, arr) => sum + arr.length, 0);
  return totalSamples * 2; // 16-bit = 2 bytes per sample
}
