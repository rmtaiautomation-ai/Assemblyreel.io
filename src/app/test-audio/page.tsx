"use client";

import { useState } from "react";
import { generateSceneSpeech } from "@/lib/ai/elevenlabs";

export default function TestAudioPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!text) return;
    setLoading(true);
    setError(null);
    setAudioUrl(null);

    try {
      const result = await generateSceneSpeech(text, "test-audio");
      if (result.success && result.audioUrl) {
        // Add a timestamp query param to bust browser cache
        setAudioUrl(`${result.audioUrl}?t=${Date.now()}`);
      } else {
        setError(result.error || "Failed to generate audio.");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-black text-white flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold mb-8">ElevenLabs Audio Test</h1>
      
      <div className="w-full max-w-md space-y-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter a short sentence to generate..."
          className="w-full p-4 rounded-lg bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white resize-none"
          rows={4}
        />

        <button
          onClick={handleGenerate}
          disabled={loading || !text}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
        >
          {loading ? "Generating..." : "Generate Audio"}
        </button>

        {error && (
          <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {audioUrl && (
          <div className="mt-8 space-y-4">
            <h2 className="text-xl font-semibold">Generated Output</h2>
            <audio controls src={audioUrl} className="w-full rounded-lg">
              <track kind="captions" />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
      </div>
    </div>
  );
}
