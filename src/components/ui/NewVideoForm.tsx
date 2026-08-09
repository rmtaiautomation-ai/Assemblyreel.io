"use client";

import React, { useState } from "react";
import { Sparkles, Wand2, Loader2, Bot, X, Send, Zap, Layout, Mic, Image as ImageIcon, MonitorPlay, Settings } from "lucide-react";
import { generateArcAndHook } from "@/lib/ai/script-writer";
import { createProjectWithActs, type ActOutline } from "@/app/actions/whiteboard-actions";
import Whiteboard from "@/components/ui/Whiteboard";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface NewVideoFormProps {
  workspace: {
    id: string;
    content_theme: string;
    aspect_ratio?: string | null;
    narration_voice_id?: string | null;
    visual_aesthetic?: string | null;
    linked_accounts?: string[] | null;
  };
}

// `value` must stay byte-identical to the keys in `src/lib/ai/generation-rules.ts`.
// The old single "Mid (2-5m)" option was split because plan 07 defines 2-3m and 4-5m
// as separate tiers with different word counts (300-450 vs 600-750) and different
// pacing (4-6s vs 5-8s clips) — one collapsed option was always wrong for one of them.
const DURATION_OPTIONS = [
  { label: "60s", value: "Short (< 60s)", desc: "Short" },
  { label: "2-3m", value: "Mid (2-3m)", desc: "Mid" },
  { label: "4-5m", value: "Mid (4-5m)", desc: "Mid" },
  { label: "10-15m", value: "Long (10-15m)", desc: "Long" },
  { label: "15-20m", value: "Long (15-20m)", desc: "Long" },
  { label: "20-25m", value: "Long (20-25m)", desc: "Long" },
  { label: "25-30m", value: "Long (25-30m)", desc: "Long" },
];

export default function NewVideoForm({ workspace }: NewVideoFormProps) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [narrativeArc, setNarrativeArc] = useState("");
  const [scriptHook, setScriptHook] = useState("");
  const [visualAesthetic, setVisualAesthetic] = useState(workspace.visual_aesthetic || "");
  const [isGeneratingHelper, setIsGeneratingHelper] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Whiteboard handoff: once the project shell and Act outlines exist, the Whiteboard
  // takes over and drives generation act by act.
  const [whiteboardState, setWhiteboardState] = useState<{
    projectId: string;
    acts: ActOutline[];
    isSinglePass: boolean;
  } | null>(null);

  const [targetDuration, setTargetDuration] = useState("Short (< 60s)");
  
  // AI Sidebar state
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user'|'ai', content: string, parsed?: any}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/ai/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: userMsg, 
          history: chatMessages,
          context: { theme: workspace.content_theme }
        })
      });
      const data = await res.json();
      if (data.success) {
        setChatMessages(prev => [...prev, { 
          role: 'ai', 
          content: data.reply,
          parsed: data.parsed
        }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'ai', content: 'Sorry, I encountered an error.' }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'ai', content: 'Network error.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleApplyAiSuggestion = (parsed: any) => {
    if (parsed.topic) setTopic(parsed.topic);
    if (parsed.narrativeArc) setNarrativeArc(parsed.narrativeArc);
    if (parsed.scriptHook) setScriptHook(parsed.scriptHook);
    if (parsed.visualAesthetic) setVisualAesthetic(parsed.visualAesthetic);
    setIsAiSidebarOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Only plans the Act structure — the Whiteboard runs the agent chain per Act so a
    // long-form video shows progress instead of blocking on one very long request.
    const result = await createProjectWithActs({
      workspaceId: workspace.id,
      workspaceTheme: workspace.content_theme,
      topic,
      narrativeArc,
      scriptHook,
      visualAesthetic: visualAesthetic || workspace.visual_aesthetic || "",
      targetDuration,
    });

    setIsSubmitting(false);

    if (result.success && result.projectId && result.acts) {
      setWhiteboardState({
        projectId: result.projectId,
        acts: result.acts,
        isSinglePass: Boolean(result.isSinglePass),
      });
      router.refresh();
    } else {
      setError(result.error || "Failed to create video project.");
    }
  };

  if (whiteboardState) {
    return (
      <Whiteboard
        projectId={whiteboardState.projectId}
        workspaceId={workspace.id}
        acts={whiteboardState.acts}
        workspaceTheme={workspace.content_theme}
        topic={topic}
        narrativeArc={narrativeArc}
        scriptHook={scriptHook}
        visualAesthetic={visualAesthetic || workspace.visual_aesthetic || ""}
        targetDuration={targetDuration}
        isSinglePass={whiteboardState.isSinglePass}
      />
    );
  }

  return (
    <div className="space-y-6">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-600"></div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles className="text-purple-600" size={24} />
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Create New Video</h2>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {workspace.aspect_ratio && (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-200 px-2 py-1 rounded-md shadow-sm whitespace-nowrap">
                <Layout size={12} className="text-purple-500 shrink-0" />
                {workspace.aspect_ratio}
              </div>
            )}

            {workspace.visual_aesthetic && (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-200 px-2 py-1 rounded-md shadow-sm whitespace-nowrap">
                <ImageIcon size={12} className="text-purple-500 shrink-0" />
                {workspace.visual_aesthetic}
              </div>
            )}
          </div>
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
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsAiSidebarOpen(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm"
              >
                <Bot size={14} />
                Open AI Co-Writer
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

          {/* Row 3: Visual Aesthetic & Target Duration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">Visual Aesthetic</label>
                <p className="text-xs text-gray-500 mb-2">The visual style and atmosphere for this video.</p>
              </div>
              <textarea 
                name="visual_aesthetic" 
                value={visualAesthetic}
                onChange={(e) => setVisualAesthetic(e.target.value)}
                className="flex-1 w-full bg-gray-50/50 border border-gray-200 text-gray-900 p-4 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 resize-none min-h-[100px] shadow-inner"
              />
            </div>

            <div className="flex flex-col">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">Target Duration</label>
                <p className="text-xs text-gray-500 mb-2">How long should this video be?</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTargetDuration(opt.value)}
                    className={`p-2 rounded-xl border text-sm transition-all flex flex-col items-center justify-center gap-0.5 ${
                      targetDuration === opt.value 
                        ? "bg-purple-600 border-purple-600 text-white shadow-md" 
                        : "bg-white border-gray-200 text-gray-700 hover:border-purple-400 hover:bg-purple-50"
                    }`}
                  >
                    <span className="font-bold">{opt.label}</span>
                    <span className="text-[10px] uppercase tracking-wider opacity-80">{opt.desc}</span>
                  </button>
                ))}
              </div>
              <input type="hidden" name="target_duration" value={targetDuration} />
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
              {isSubmitting ? "Planning acts…" : "Generate Story"}
            </button>
          </div>
        </form>
      </div>

      {/* AI Sidebar Overlay */}
      {isAiSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsAiSidebarOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-300">
            
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <div className="flex items-center gap-2">
                <div className="bg-purple-100 p-2 rounded-lg">
                  <Bot className="text-purple-600" size={20} />
                </div>
                <h3 className="font-bold text-gray-900">AI Co-Writer</h3>
              </div>
              <button onClick={() => setIsAiSidebarOpen(false)} className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {chatMessages.length === 0 && (
                <div className="text-center text-gray-500 mt-10">
                  <Sparkles className="mx-auto mb-3 text-purple-400" size={32} />
                  <p className="text-sm">I can help you brainstorm a topic, write a catchy hook, and build your narrative arc. What kind of story do you want to tell?</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`p-3 rounded-2xl max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-purple-600 text-white rounded-br-none' : 'bg-white border shadow-sm text-gray-800 rounded-bl-none'}`}>
                    {msg.content}
                  </div>
                  {msg.parsed && msg.role === 'ai' && (
                    <button 
                      onClick={() => handleApplyAiSuggestion(msg.parsed)}
                      className="mt-2 text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded-full font-bold transition-colors"
                    >
                      Apply to Form ✨
                    </button>
                  )}
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="p-3 bg-white border shadow-sm rounded-2xl rounded-bl-none flex gap-1 items-center">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-white border-t">
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSendChat(); }}
                className="flex items-center gap-2"
              >
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask for ideas..."
                  className="flex-1 bg-gray-100 border-none rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button 
                  type="submit"
                  disabled={!chatInput.trim() || isChatLoading}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white p-2.5 rounded-full transition-colors flex-shrink-0"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
