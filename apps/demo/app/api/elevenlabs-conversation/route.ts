// apps/demo/app/api/elevenlabs-conversation/route.ts

import { ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID } from "../secrets";

export async function GET() {
  try {
    // Validar que tenemos las credenciales
    if (
      !ELEVENLABS_API_KEY ||
      ELEVENLABS_API_KEY === "YOUR_ELEVENLABS_API_KEY"
    ) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY no configurada" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!ELEVENLABS_AGENT_ID || ELEVENLABS_AGENT_ID === "YOUR_AGENT_ID_HERE") {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_AGENT_ID no configurado" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Obtener signed URL de ElevenLabs
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to get signed URL",
          details: errorText,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify({ signed_url: data.signed_url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error getting signed URL:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
