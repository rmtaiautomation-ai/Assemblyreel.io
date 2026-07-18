"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Settings2, Plus, Check, RefreshCw, AlertCircle, ArrowRight, Fingerprint, Mic2, Sparkles, X } from 'lucide-react';

// Custom Brand SVGs
const YouTubeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#FF0000" stroke="none"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="#FFFFFF"></polygon></svg>
);

const TikTokIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#000000" stroke="none"><path d="M19.589 6.686a4.793 4.793 0 0 1-3.97-1.561 4.795 4.795 0 0 1-1.238-3.184h-3.693v13.627a3.844 3.844 0 0 1-3.842 3.843 3.844 3.844 0 0 1-3.843-3.843 3.844 3.844 0 0 1 3.843-3.842c.18 0 .356.012.528.036v-3.794a7.518 7.518 0 0 0-.528-.019 7.533 7.533 0 0 0-7.532 7.533 7.533 7.533 0 0 0 7.532 7.533 7.533 7.533 0 0 0 7.533-7.533V11.235a8.435 8.435 0 0 0 5.21 1.776v-3.85a4.796 4.796 0 0 1-3.078-1.57 4.792 4.792 0 0 1-1.077-3.003h3.155z"/></svg>
);

const InstagramIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#ig-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="ig-grad" x1="2" y1="22" x2="22" y2="2">
        <stop offset="0%" stopColor="#feda75" />
        <stop offset="25%" stopColor="#fa7e1e" />
        <stop offset="50%" stopColor="#d62976" />
        <stop offset="75%" stopColor="#962fbf" />
        <stop offset="100%" stopColor="#4f5bd5" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<'social' | 'ai'>('social');
  const [connecting, setConnecting] = useState<string | null>(null);
  
  // Mock connection handlers
  const handleConnect = (id: string) => {
    setConnecting(id);
    setTimeout(() => {
      setConnecting(null);
      // In a real app, this would redirect to OAuth
    }, 1500);
  };

  const integrations = {
    social: [
      {
        id: "youtube",
        name: "YouTube Shorts",
        description: "Auto-publish generated videos directly to your YouTube channel as Shorts.",
        icon: <YouTubeIcon />,
        status: "connected",
        accountName: "TechNewsDaily",
        color: "bg-red-50",
        borderColor: "border-red-100",
      },
      {
        id: "tiktok",
        name: "TikTok",
        description: "Seamlessly push your series to TikTok with trending sound options.",
        icon: <TikTokIcon />,
        status: "disconnected",
        color: "bg-gray-100",
        borderColor: "border-gray-200",
      },
      {
        id: "instagram",
        name: "Instagram Reels",
        description: "Post high-quality reels to Instagram to grow your audience.",
        icon: <InstagramIcon />,
        status: "disconnected",
        color: "bg-pink-50",
        borderColor: "border-pink-100",
      }
    ],
    ai: [
      {
        id: "elevenlabs",
        name: "ElevenLabs",
        description: "Ultra-realistic voice cloning and text-to-speech for your videos.",
        icon: <div className="w-7 h-7 bg-black rounded flex items-center justify-center"><span className="text-white font-bold text-xs">XI</span></div>,
        status: "connected",
        accountName: "Custom API Key",
        color: "bg-gray-100",
        borderColor: "border-gray-200",
      },
      {
        id: "openai",
        name: "OpenAI",
        description: "Generate video scripts, metadata, and dynamic prompts automatically.",
        icon: <div className="w-7 h-7 bg-emerald-500 rounded flex items-center justify-center"><Sparkles size={16} className="text-white" /></div>,
        status: "connected",
        accountName: "Default (Managed)",
        color: "bg-emerald-50",
        borderColor: "border-emerald-100",
      }
    ]
  };

  // Container variants for staggered animation
  const container: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Integrations</h1>
          <p className="text-text-secondary mt-1">Connect your favorite platforms to automate your workflow.</p>
        </div>
      </div>

      {/* Custom Tabs */}
      <div className="flex space-x-1 bg-gray-100/50 p-1 rounded-xl w-full max-w-sm mb-8 border border-gray-200/60">
        <button
          onClick={() => setActiveTab('social')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'social' 
              ? 'bg-white text-foreground shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Fingerprint size={16} /> Social Platforms
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'ai' 
              ? 'bg-white text-foreground shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Mic2 size={16} /> AI Providers
        </button>
      </div>

      {/* Integration Grid */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={activeTab}
          variants={container}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, y: -10, transition: { duration: 0.1 } }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {integrations[activeTab].map((integration) => (
            <motion.div 
              key={integration.id}
              variants={item}
              className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col h-full"
            >
              {/* Top Section */}
              <div className="flex items-start justify-between mb-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${integration.color} ${integration.borderColor} border shadow-inner`}>
                  {integration.icon}
                </div>
                
                {integration.status === 'connected' ? (
                  <span className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-bold border border-green-100">
                    <Check size={12} /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold">
                    Not Connected
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground mb-1">{integration.name}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {integration.description}
                </p>
              </div>

              {/* Action Area */}
              <div className="mt-6 pt-5 border-t border-gray-100">
                {integration.status === 'connected' ? (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Account</span>
                      <span className="text-sm font-semibold text-gray-900 truncate max-w-[140px]">{integration.accountName}</span>
                    </div>
                    <button className="text-gray-400 hover:text-foreground p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Settings">
                      <Settings2 size={18} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => handleConnect(integration.id)}
                    disabled={connecting === integration.id}
                    className="w-full bg-foreground hover:bg-gray-800 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 group-hover:shadow-lg disabled:opacity-70"
                  >
                    {connecting === integration.id ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      <>
                        <Plus size={18} /> Connect {integration.name}
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          ))}

          {/* Coming Soon Card */}
          {activeTab === 'social' && (
            <motion.div 
              variants={item}
              className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-6 flex flex-col items-center justify-center text-center h-full min-h-[240px]"
            >
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <AlertCircle size={20} className="text-gray-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-500 mb-1">More platforms coming</h3>
              <p className="text-xs text-gray-400 max-w-[200px]">We're constantly adding new ways to distribute your content.</p>
            </motion.div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
