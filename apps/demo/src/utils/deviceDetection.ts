// apps/demo/src/utils/deviceDetection.ts

// Type definitions for Network Information API
interface NetworkInformation {
  effectiveType?: string;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

interface WindowWithAudioContext extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

export interface DeviceProfile {
  platform: "ios" | "android" | "desktop";
  networkType: "4g" | "3g" | "2g" | "wifi" | "unknown";
  audioConfig: AudioConfig;
}

export interface AudioConfig {
  initialDelay: number; // ms para delay inicial (PHASE 1)
  gapThreshold: number; // ms sin chunks = fin de respuesta
  maxBufferSize: number; // bytes máximo antes de enviar
  leadingSilence: number; // ms de silencio al inicio
  trailingSilence: number; // ms de silencio al final
}

export function detectDevice(): DeviceProfile {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid;

  // Detección de tipo de red (Network Information API)
  const nav = navigator as NavigatorWithConnection;
  const connection =
    nav.connection || nav.mozConnection || nav.webkitConnection;

  const effectiveType = (connection?.effectiveType ||
    "unknown") as DeviceProfile["networkType"];

  // Configuración base según dispositivo
  if (isMobile) {
    // Mobile optimizado
    return {
      platform: isIOS ? "ios" : "android",
      networkType: effectiveType,
      audioConfig: {
        initialDelay: effectiveType === "4g" ? 100 : 120, // Más delay en 3G
        gapThreshold: 150, // Gap más rápido
        maxBufferSize: effectiveType === "4g" ? 600 * 1024 : 400 * 1024,
        leadingSilence: 100, // Más silencio inicial
        trailingSilence: 150,
      },
    };
  }

  // Desktop optimizado
  return {
    platform: "desktop",
    networkType: effectiveType,
    audioConfig: {
      initialDelay: 80, // Delay MASTER original
      gapThreshold: 200, // Gap detection estándar
      maxBufferSize: 900 * 1024, // 900KB seguro
      leadingSilence: 100,
      trailingSilence: 150,
    },
  };
}

/**
 * Detecta si el browser soporta las APIs necesarias
 */
export function detectBrowserCapabilities() {
  const win = window as WindowWithAudioContext;
  return {
    hasMediaDevices: !!(
      navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    ),
    hasAudioContext: !!(win.AudioContext || win.webkitAudioContext),
    hasWebSocket: !!window.WebSocket,
  };
}
