"use client";

import { useState } from "react";
import { LiveAvatarSession } from "./LiveAvatarSession";
import { ElevenLabsConversationalDemo } from "./ElevenLabsConversationalDemo";

export const LiveAvatarDemo = () => {
  const [sessionToken, setSessionToken] = useState("");
  const [mode, setMode] = useState<"FULL" | "CUSTOM" | "CONVERSATIONAL">(
    "FULL",
  );
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    try {
      const res = await fetch("/api/start-session", {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json();
        setError(error.error);
        return;
      }
      const { session_token } = await res.json();
      setSessionToken(session_token);
      setMode("FULL");
    } catch (error: unknown) {
      setError((error as Error).message);
    }
  };

  const handleStartCustom = async () => {
    const res = await fetch("/api/start-custom-session", {
      method: "POST",
    });
    if (!res.ok) {
      const error = await res.json();
      setError(error.error);
      return;
    }
    const { session_token } = await res.json();
    setSessionToken(session_token);
    setMode("CUSTOM");
  };

  const handleStartConversational = async () => {
    const res = await fetch("/api/start-custom-session", {
      method: "POST",
    });
    if (!res.ok) {
      const error = await res.json();
      setError(error.error);
      return;
    }
    const { session_token } = await res.json();
    setSessionToken(session_token);
    setMode("CONVERSATIONAL");
  };

  const onSessionStopped = () => {
    // Reset the FE state
    setSessionToken("");
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
      {!sessionToken ? (
        <>
          {error && (
            <div className="text-red-500">
              {"Error getting session token: " + error}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleStart}
              className="w-fit bg-white text-black px-4 py-2 rounded-md hover:bg-gray-100"
            >
              Start Full Avatar Session
            </button>

            <button
              onClick={handleStartCustom}
              className="w-fit bg-white text-black px-4 py-2 rounded-md hover:bg-gray-100"
            >
              Start Custom Avatar Session
            </button>

            <button
              onClick={handleStartConversational}
              className="w-fit bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
            >
              Start Conversational AI Demo
            </button>
          </div>
        </>
      ) : mode === "CONVERSATIONAL" ? (
        <ElevenLabsConversationalDemo
          sessionAccessToken={sessionToken}
          onSessionStopped={onSessionStopped}
        />
      ) : (
        <LiveAvatarSession
          mode={mode as "FULL" | "CUSTOM"}
          sessionAccessToken={sessionToken}
          onSessionStopped={onSessionStopped}
        />
      )}
    </div>
  );
};
