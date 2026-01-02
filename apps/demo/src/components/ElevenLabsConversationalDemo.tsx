"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  LiveAvatarSession,
  SessionState,
  SessionEvent,
  AgentEventsEnum,
} from "@heygen/liveavatar-web-sdk";
import { useElevenLabsConversation } from "../liveavatar/useElevenLabsConversation";
import { AudioHandler } from "../utils/audioHandler";
import { AudioPlaybackQueue } from "../utils/audioPlayback";
import {
  detectDevice,
  detectBrowserCapabilities,
} from "../utils/deviceDetection";

interface ElevenLabsConversationalDemoProps {
  sessionAccessToken: string;
  onSessionStopped: () => void;
}

export const ElevenLabsConversationalDemo: React.FC<
  ElevenLabsConversationalDemoProps
> = ({ sessionAccessToken, onSessionStopped }) => {
  // Referencias
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioHandlerRef = useRef<AudioHandler | null>(null);
  const audioPlaybackRef = useRef<AudioPlaybackQueue | null>(null);

  // Estados
  const [sessionState, setSessionState] = useState<SessionState>(
    SessionState.INACTIVE,
  );
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [userTranscript, setUserTranscript] = useState<string>("");
  const [agentResponse, setAgentResponse] = useState<string>("");
  const [conversationId, setConversationId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Detección de dispositivo
  const deviceProfile = detectDevice();
  const browserCaps = detectBrowserCapabilities();

  /**
   * Inicializar HeyGen session
   */
  useEffect(() => {
    if (!sessionAccessToken) return;

    console.log("[Demo] Inicializando sesión HeyGen...");

    const session = new LiveAvatarSession(sessionAccessToken, {
      voiceChat: false, // CUSTOM mode - manejamos audio manualmente
    });

    sessionRef.current = session;

    // Event listeners de HeyGen
    session.on(SessionEvent.SESSION_STATE_CHANGED, (state: SessionState) => {
      console.log("[Demo] HeyGen session state:", state);
      setSessionState(state);

      if (state === SessionState.DISCONNECTED) {
        onSessionStopped();
      }
    });

    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      console.log("[Demo] HeyGen stream ready");
      setIsStreamReady(true);
    });

    session.on(
      AgentEventsEnum.AVATAR_SPEAK_STARTED,
      (event: { event_id: string }) => {
        console.log(
          "[Demo] Avatar started speaking, event_id:",
          event.event_id,
        );
      },
    );

    session.on(
      AgentEventsEnum.AVATAR_SPEAK_ENDED,
      (event: { event_id: string }) => {
        console.log(
          "[Demo] Avatar finished speaking, event_id:",
          event.event_id,
        );
      },
    );

    // Iniciar sesión
    session.start().catch((err) => {
      console.error("[Demo] Error starting session:", err);
      setError("Error iniciando sesión HeyGen");
    });

    return () => {
      if (session) {
        session.stop();
      }
    };
  }, [sessionAccessToken, onSessionStopped]);

  /**
   * Adjuntar stream al video element
   */
  useEffect(() => {
    if (isStreamReady && videoRef.current && sessionRef.current) {
      console.log("[Demo] Adjuntando stream al video element");
      sessionRef.current.attach(videoRef.current);
    }
  }, [isStreamReady]);

  /**
   * Inicializar AudioHandler
   */
  useEffect(() => {
    console.log("[Demo] Configuración de dispositivo:", deviceProfile);

    const handler = new AudioHandler(deviceProfile.audioConfig, {
      onSendAudio: (audioBase64) => {
        if (sessionRef.current) {
          console.log("[Demo] Enviando audio a HeyGen...");
          sessionRef.current.repeatAudio(audioBase64);
        }
      },
      onError: (error) => {
        console.error("[Demo] AudioHandler error:", error);
        setError("Error procesando audio");
      },
    });

    audioHandlerRef.current = handler;

    return () => {
      handler.reset();
    };
  }, [deviceProfile]);

  /**
   * Inicializar AudioPlayback
   */
  useEffect(() => {
    audioPlaybackRef.current = new AudioPlaybackQueue();

    return () => {
      audioPlaybackRef.current?.stop();
    };
  }, []);

  /**
   * Hook de ElevenLabs
   */
  const {
    connect: connectElevenLabs,
    disconnect: disconnectElevenLabs,
    isConnected: isElevenLabsConnected,
    isConnecting: isElevenLabsConnecting,
  } = useElevenLabsConversation({
    onAudioChunk: (chunkBase64, eventId) => {
      // Audio del agente de ElevenLabs
      console.log(
        `[Demo] Recibido audio chunk del agente, event_id: ${eventId}`,
      );

      // Enviar a AudioHandler para procesar y enviar a HeyGen
      audioHandlerRef.current?.handleChunk(chunkBase64);

      // También reproducir localmente (opcional - para oír al agente)
      // audioPlaybackRef.current?.enqueue(chunkBase64);
    },

    onUserTranscript: (text) => {
      // Usuario habló - interrupción
      console.log("[Demo] Usuario dijo:", text);
      setUserTranscript(text);

      // Interrumpir procesamiento de audio
      audioHandlerRef.current?.handleInterrupt();

      // Interrumpir avatar de HeyGen
      sessionRef.current?.interrupt();

      // Detener playback local
      audioPlaybackRef.current?.stop();
    },

    onAgentResponse: (text) => {
      // Respuesta del agente (texto)
      console.log("[Demo] Agente respondió:", text);
      setAgentResponse(text);
    },

    onConnectionEstablished: (convId) => {
      console.log("[Demo] Conversación ElevenLabs iniciada:", convId);
      setConversationId(convId);
    },

    onError: (error) => {
      console.error("[Demo] ElevenLabs error:", error);
      setError(error.message);
    },
  });

  /**
   * Iniciar conversación
   */
  const handleStartConversation = useCallback(async () => {
    // Validar permisos de micrófono
    if (!browserCaps.hasMediaDevices) {
      setError("Tu navegador no soporta acceso al micrófono");
      return;
    }

    // Validar que HeyGen esté listo
    if (sessionState !== SessionState.CONNECTED || !isStreamReady) {
      setError("Esperando conexión con HeyGen...");
      return;
    }

    try {
      // Pedir permisos de micrófono
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Conectar a ElevenLabs
      await connectElevenLabs();
    } catch (error) {
      console.error("[Demo] Error starting conversation:", error);
      setError("Error iniciando conversación");
    }
  }, [browserCaps, sessionState, isStreamReady, connectElevenLabs]);

  /**
   * Detener conversación
   */
  const handleStopConversation = useCallback(() => {
    disconnectElevenLabs();
    audioHandlerRef.current?.reset();
    audioPlaybackRef.current?.stop();
    setUserTranscript("");
    setAgentResponse("");
  }, [disconnectElevenLabs]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4">
      {/* Video del Avatar */}
      <div className="relative w-full max-w-2xl aspect-video bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />

        {/* Overlay de estado */}
        {sessionState !== SessionState.CONNECTED && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
            <p className="text-white text-lg">
              {sessionState === SessionState.CONNECTING
                ? "Conectando..."
                : "Iniciando..."}
            </p>
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="flex gap-2">
        <button
          onClick={handleStartConversation}
          disabled={
            isElevenLabsConnected ||
            isElevenLabsConnecting ||
            sessionState !== SessionState.CONNECTED
          }
          className="px-6 py-3 bg-blue-500 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition"
        >
          {isElevenLabsConnecting ? "Conectando..." : "Iniciar Conversación"}
        </button>

        <button
          onClick={handleStopConversation}
          disabled={!isElevenLabsConnected}
          className="px-6 py-3 bg-red-500 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-red-600 transition"
        >
          Detener
        </button>
      </div>

      {/* Estados y transcripciones */}
      <div className="w-full max-w-2xl space-y-2">
        {/* Estado de conexión */}
        <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg">
          <div
            className={`w-3 h-3 rounded-full ${
              isElevenLabsConnected ? "bg-green-500" : "bg-gray-400"
            }`}
          />
          <p className="text-sm">
            {isElevenLabsConnected ? "Conversación activa" : "Desconectado"}
            {conversationId && ` - ID: ${conversationId.slice(0, 8)}`}
          </p>
        </div>

        {/* Configuración de dispositivo */}
        <div className="p-3 bg-gray-100 rounded-lg text-sm">
          <p>
            <strong>Dispositivo:</strong> {deviceProfile.platform}
          </p>
          <p>
            <strong>Red:</strong> {deviceProfile.networkType}
          </p>
          <p>
            <strong>Delay inicial:</strong>{" "}
            {deviceProfile.audioConfig.initialDelay}ms
          </p>
          <p>
            <strong>Gap threshold:</strong>{" "}
            {deviceProfile.audioConfig.gapThreshold}ms
          </p>
        </div>

        {/* Transcripción del usuario */}
        {userTranscript && (
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">Tú:</p>
            <p className="text-sm">{userTranscript}</p>
          </div>
        )}

        {/* Respuesta del agente */}
        {agentResponse && (
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">Agente:</p>
            <p className="text-sm">{agentResponse}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};
