"use client";

import React, { useState } from "react";
import { Sparkles, Wand2, Loader2, UploadCloud } from "lucide-react";
import { generateArcAndHook } from "@/lib/ai/script-writer";
import { createAndGenerateVideo } from "@/app/actions/video-actions";
import { useRouter } from "next/navigation";

interface NewVideoFormProps {
  workspace: {
    id: string;
    content_theme: string;
    visual_aesthetic: string;
  };
}

export default function NewVideoForm({ workspace }: NewVideoFormProps) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [narrativeArc, setNarrativeArc] = useState("");
  const [scriptHook, setScriptHook] = useState("");
  const [isGeneratingHelper, setIsGeneratingHelper] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [generatedScript, setGeneratedScript] = useState<string[] | null>(null);
  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);

  const handleAutoGenerate = async () => {
    if (!topic) {
      alert("Please enter a Topic below first, so the AI knows what to write about!");
      return;
    }
    
    setIsGeneratingHelper(true);
    try {
      const res = await generateArcAndHook(topic, workspace.content_theme);
      if (res.success && res.data) {
        setNarrativeArc(res.data.narrativeArc);
        setScriptHook(res.data.scriptHook);
      } else {
        alert(res.error || "Failed to generate Outline & Hook.");
      }
    } catch (err) {
      alert("An error occurred");
    } finally {
      setIsGeneratingHelper(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setGeneratedScript(null);
    
    const formData = new FormData(e.currentTarget);
    
    const result = await createAndGenerateVideo(
      workspace.id,
      workspace.content_theme,
      workspace.visual_aesthetic,
      formData
    );

    setIsSubmitting(false);

    if (result.success && result.projectId) {
      if (result.masterScript) {
        // Split the plain text script into an array of lines for the UI
        const lines = result.masterScript.split("\n").filter(line => line.trim() !== "");
        setGeneratedScript(lines);
      }
      setGeneratedProjectId(result.projectId);
      router.refresh();
    } else {
      setError(result.error || "Failed to generate video project.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-600"></div>
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="text-purple-600" size={24} />
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Create New Video</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Row 1: Full Story Outline + Auto Gen Button */}
          <div className="space-y-2">
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">Full Story Outline</label>
              <p className="text-xs text-gray-500 mb-2">The complete plot or sequence of events for your story.</p>
            </div>
            <div className="relative">
              <textarea 
                name="narrative_arc" 
                value={narrativeArc}
                onChange={(e) => setNarrativeArc(e.target.value)}
                className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 p-4 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all resize-none min-h-[140px] shadow-inner"
                placeholder="e.g. A blinded, captive warrior asks for one last burst of strength..."
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAutoGenerate}
                disabled={isGeneratingHelper}
                className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-100 font-semibold text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
              >
                {isGeneratingHelper ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Auto-Generate Outline & Hook
              </button>
            </div>
          </div>

          {/* Row 2: Topic & Script Hook */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">Topic</label>
                <p className="text-xs text-gray-500 mb-2">The main subject or title of this video.</p>
              </div>
              <textarea
                name="topic"
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="flex-1 w-full bg-gray-50/50 border border-gray-200 text-gray-900 p-4 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all resize-none min-h-[100px] shadow-inner"
                placeholder="e.g. Samson's Final Stand"
              />
            </div>

            <div className="flex flex-col">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">Script Hook</label>
                <p className="text-xs text-gray-500 mb-2">The attention-grabbing first 5 seconds.</p>
              </div>
              <textarea
                name="script_hook"
                value={scriptHook}
                onChange={(e) => setScriptHook(e.target.value)}
                className="flex-1 w-full bg-gray-50/50 border border-gray-200 text-gray-900 p-4 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all resize-none min-h-[100px] shadow-inner"
                placeholder="e.g. One man destroys an entire empire's leadership..."
              />
            </div>
          </div>

          {/* Row 3: Visual Aesthetic & Reference Images */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">Visual Aesthetic</label>
                <p className="text-xs text-gray-500 mb-2">The visual style and atmosphere for this video.</p>
              </div>
              <textarea 
                name="visual_aesthetic" 
                defaultValue={workspace.visual_aesthetic}
                className="flex-1 w-full bg-gray-50/50 border border-gray-200 text-gray-900 p-4 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 resize-none min-h-[100px] shadow-inner"
              />
            </div>

            <div className="flex flex-col">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">Reference Images</label>
                <p className="text-xs text-gray-500 mb-2">Upload up to 3 images for character consistency.</p>
              </div>
              <div className="flex-1 relative w-full bg-gray-50/50 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-100 hover:border-purple-400 transition-all flex flex-col items-center justify-center group min-h-[100px]">
                <input 
                  type="file" 
                  name="images"
                  multiple 
                  accept="image/*"
                  onChange={(e) => setFileCount(e.target.files?.length || 0)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center justify-center text-gray-500 group-hover:text-purple-600 transition-colors">
                  <UploadCloud size={24} className="mb-1" />
                  <span className="text-sm font-medium">
                    {fileCount > 0 ? `${fileCount} file(s) selected` : "Click or drag files here"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-lg border border-red-100">{error}</div>
          )}

          <div className="flex justify-end pt-6 border-t border-gray-100 mt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-gray-900 hover:bg-gray-800 text-white font-bold px-8 py-3.5 rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-[1px]"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
              Generate Script
            </button>
          </div>
        </form>
      </div>

      {generatedScript && generatedProjectId && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
            <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="text-purple-600" size={24} />
              Generated Script
            </h3>
            <button 
              onClick={() => router.push(`/workspaces/${workspace.id}/videos/${generatedProjectId}`)}
              className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md hover:-translate-y-[1px]"
            >
              Open Video Workspace →
            </button>
          </div>
          
          <div className="space-y-4">
            {generatedScript.map((line, idx) => (
              <div key={idx} className="flex gap-4 items-start group">
                <div className="bg-gray-100 text-gray-500 group-hover:bg-purple-100 group-hover:text-purple-700 text-xs font-bold w-6 h-6 flex items-center justify-center rounded-md mt-2 shrink-0 transition-colors">
                  {idx + 1}
                </div>
                <textarea 
                  readOnly
                  defaultValue={line}
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-xl p-4 text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-200 resize-none min-h-[72px] shadow-sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
