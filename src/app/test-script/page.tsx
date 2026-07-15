"use client";

import { useState } from "react";
import { generateScript } from "@/lib/ai/script-writer";

export default function TestScriptPage() {
  const [topic, setTopic] = useState("The Fall of Jericho");
  const [narrativeArc, setNarrativeArc] = useState("A seemingly impossible obstacle overcome by divine intervention.");
  const [hook, setHook] = useState("The walls were too thick, but they didn't know who was coming.");
  const [visualAesthetic, setVisualAesthetic] = useState("Cinematic, dusty ancient realism, golden hour, epic scale");
  const [pov, setPov] = useState("Third-person omnipresent");
  
  const [loading, setLoading] = useState(false);
  const [scriptLines, setScriptLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setScriptLines([]);

    try {
      const result = await generateScript({
        topic,
        narrativeArc,
        hook,
        visualAesthetic,
        pov,
      });

      if (result.success && result.scriptLines) {
        setScriptLines(result.scriptLines);
      } else {
        setError(result.error || "Failed to generate script.");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-black text-white flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-8">Script Writer (Gemini) Test</h1>
      
      <div className="w-full max-w-2xl space-y-4 bg-gray-900 p-6 rounded-lg border border-gray-700">
        <div>
          <label className="block text-sm font-medium mb-1">Topic</label>
          <input value={topic} onChange={e => setTopic(e.target.value)} className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Narrative Arc</label>
          <input value={narrativeArc} onChange={e => setNarrativeArc(e.target.value)} className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Hook</label>
          <input value={hook} onChange={e => setHook(e.target.value)} className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Visual Aesthetic</label>
          <input value={visualAesthetic} onChange={e => setVisualAesthetic(e.target.value)} className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">POV</label>
          <input value={pov} onChange={e => setPov(e.target.value)} className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white" />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-3 px-4 mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
        >
          {loading ? "Generating..." : "Generate Script"}
        </button>

        {error && (
          <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200 mt-4">
            {error}
          </div>
        )}
      </div>

      {scriptLines.length > 0 && (
        <div className="w-full max-w-2xl mt-8 space-y-4">
          <h2 className="text-xl font-semibold">Generated Script ({scriptLines.length} lines)</h2>
          <div className="bg-gray-900 p-6 rounded-lg border border-gray-700 space-y-3">
            {scriptLines.map((line, index) => (
              <div key={index} className="flex gap-4">
                <span className="text-gray-500 font-mono text-sm">{index + 1}</span>
                <p className="text-gray-200">{line}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
