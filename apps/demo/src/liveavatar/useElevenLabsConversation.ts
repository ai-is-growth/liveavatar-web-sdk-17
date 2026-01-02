// apps/demo/src/liveavatar/useElevenLabsConversation.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Tipos de eventos WebSocket de ElevenLabs
type BaseEvent = {
  type: string;
};

type ConversationInitiationMetadataEvent = BaseEvent & {
  type: "conversation_initiation_metadata";
  conversation_initiation_metadata_event: {
    conversation_id: string;
    agent_output_audio_format: string;
    user_input_audio_format: string;
  };
};

type UserTranscriptEvent = BaseEvent & {
  type: "user_transcript";
  user_transcription_event: {
    user_transcript: string;
  };
};

type AgentResponseEvent = BaseEvent & {
  type: "agent_response";
  agent_response_event: {
    agent_response: string;
  };
};

type AgentResponseCorrectionEvent = BaseEvent & {
  type: "agent_response_correction";
  agent_response_correction_event: {
    original_agent_response: string;
    corrected_agent_response: string;
  };
};

type AudioEvent = BaseEvent & {
  type: "audio";
  audio_event: {
    audio_base_64: string;
    event_id: number;
  };
};

type InterruptionEvent = BaseEvent & {
  type: "interruption";
  interruption_event: {
    event_id: number;
  };
};

type PingEvent = BaseEvent & {
  type: "ping";
  ping_event: {
    event_id: number;
    ping_ms?: number;
  };
};

type ElevenLabsWebSocketEvent =
  | ConversationInitiationMetadataEvent
  | UserTranscriptEvent
  | AgentResponseEvent
  | AgentResponseCorrectionEvent
  | AudioEvent
  | InterruptionEvent
  | PingEvent;

export interface ElevenLabsCallbacks {
  onAudioChunk: (chunkBase64: string, eventId: number) => void;
  onUserTranscript: (text: string) => void;
  onAgentResponse: (text: string) => void;
  onAgentResponseCorrection?: (original: string, corrected: string) => void;
  onInterruption?: (eventId: number) => void;
  onError?: (error: Error) => void;
  onConnectionEstablished?: (conversationId: string) => void;
}

/**
 * Hook para manejar WebSocket de ElevenLabs Conversational AI
 */
export function useElevenLabsConversation(callbacks: ElevenLabsCallbacks) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  /**
   * Envía un mensaje al WebSocket
   */
  const sendMessage = useCallback((data: object) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("[ElevenLabs] WebSocket no está abierto");
      return;
    }
    wsRef.current.send(JSON.stringify(data));
  }, []);

  /**
   * Conecta al WebSocket de ElevenLabs
   */
  const connect = useCallback(async () => {
    if (isConnected || isConnecting) {
      console.warn("[ElevenLabs] Ya está conectado o conectando");
      return;
    }

    setIsConnecting(true);

    try {
      // 1. Obtener signed URL del backend
      console.log("[ElevenLabs] Obteniendo signed URL...");
      const response = await fetch("/api/elevenlabs-conversation");

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to get signed URL");
      }

      const { signed_url } = await response.json();
      console.log("[ElevenLabs] Signed URL obtenida, conectando WebSocket...");

      // 2. Crear WebSocket
      const ws = new WebSocket(signed_url);
      wsRef.current = ws;

      // 3. Handler de apertura de conexión
      ws.onopen = async () => {
        console.log("[ElevenLabs] WebSocket conectado");

        // Enviar mensaje de iniciación
        sendMessage({
          type: "conversation_initiation_client_data",
        });

        setIsConnected(true);
        setIsConnecting(false);

        // Iniciar captura de micrófono
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });

          mediaStreamRef.current = stream;

          // Configurar MediaRecorder para enviar audio en chunks
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: "audio/webm",
          });

          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              // Convertir blob a base64
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = (reader.result as string).split(",")[1];
                sendMessage({
                  user_audio_chunk: base64,
                });
              };
              reader.readAsDataURL(event.data);
            }
          };

          // Iniciar grabación (envía chunks cada 100ms)
          mediaRecorder.start(100);
          console.log("[ElevenLabs] Captura de micrófono iniciada");
        } catch (error) {
          console.error("[ElevenLabs] Error accediendo al micrófono:", error);
          callbacks.onError?.(error as Error);
        }
      };

      // 4. Handler de mensajes
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ElevenLabsWebSocketEvent;

          switch (data.type) {
            case "conversation_initiation_metadata": {
              console.log(
                "[ElevenLabs] Conversación iniciada:",
                data.conversation_initiation_metadata_event.conversation_id,
              );
              callbacks.onConnectionEstablished?.(
                data.conversation_initiation_metadata_event.conversation_id,
              );
              break;
            }

            case "audio": {
              // Audio chunk del agente
              const { audio_base_64, event_id } = data.audio_event;
              callbacks.onAudioChunk(audio_base_64, event_id);
              break;
            }

            case "user_transcript": {
              // Usuario habló (= interrupción)
              const { user_transcript } = data.user_transcription_event;
              console.log("[ElevenLabs] Usuario dijo:", user_transcript);
              callbacks.onUserTranscript(user_transcript);
              break;
            }

            case "agent_response": {
              // Respuesta del agente (texto)
              const { agent_response } = data.agent_response_event;
              console.log("[ElevenLabs] Agente respondió:", agent_response);
              callbacks.onAgentResponse(agent_response);
              break;
            }

            case "agent_response_correction": {
              // Corrección de respuesta
              const { original_agent_response, corrected_agent_response } =
                data.agent_response_correction_event;
              console.log(
                "[ElevenLabs] Respuesta corregida:",
                corrected_agent_response,
              );
              callbacks.onAgentResponseCorrection?.(
                original_agent_response,
                corrected_agent_response,
              );
              break;
            }

            case "interruption": {
              // Interrupción detectada
              const { event_id: interrupted_event_id } =
                data.interruption_event;
              console.log(
                "[ElevenLabs] Interrupción detectada, event_id:",
                interrupted_event_id,
              );
              callbacks.onInterruption?.(interrupted_event_id);
              break;
            }

            case "ping": {
              // Ping/Pong para keep-alive
              const { event_id: ping_event_id, ping_ms } = data.ping_event;

              // Responder con pong después del delay recomendado
              setTimeout(() => {
                sendMessage({
                  type: "pong",
                  event_id: ping_event_id,
                });
              }, ping_ms || 0);
              break;
            }

            default: {
              console.log(
                "[ElevenLabs] Evento no manejado:",
                (data as BaseEvent).type,
              );
            }
          }
        } catch (error) {
          console.error("[ElevenLabs] Error procesando mensaje:", error);
          callbacks.onError?.(error as Error);
        }
      };

      // 5. Handler de cierre
      ws.onclose = () => {
        console.log("[ElevenLabs] WebSocket cerrado");
        setIsConnected(false);
        setIsConnecting(false);

        // Detener micrófono
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== "inactive"
        ) {
          mediaRecorderRef.current.stop();
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        }

        wsRef.current = null;
      };

      // 6. Handler de error
      ws.onerror = (error) => {
        console.error("[ElevenLabs] WebSocket error:", error);
        callbacks.onError?.(new Error("WebSocket error"));
        setIsConnecting(false);
      };
    } catch (error) {
      console.error("[ElevenLabs] Error conectando:", error);
      callbacks.onError?.(error as Error);
      setIsConnecting(false);
    }
  }, [isConnected, isConnecting, callbacks, sendMessage]);

  /**
   * Desconecta el WebSocket
   */
  const disconnect = useCallback(() => {
    console.log("[ElevenLabs] Desconectando...");

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsConnected(false);
  }, []);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    connect,
    disconnect,
    isConnected,
    isConnecting,
    sendMessage,
  };
}
