"use client";
import Link from "next/link";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { PlayCircle, Zap, CheckCircle2, Clock, TrendingUp, DollarSign, Layers, Sparkles, EyeOff, VideoOff, CalendarX, Film, Wand2, Plus, Check, X, Info } from "lucide-react";

export default function PricingPage() {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/workspaces");
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="min-h-screen bg-background flex flex-col font-sans"
    >
      {/* Navigation */}
      <header className="w-full border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center tracking-tight cursor-pointer overflow-hidden w-[240px] h-14 -ml-4">
            <img src="/logo.jpg" alt="Assemblyreels Logo" className="w-full h-full object-contain scale-[3] mix-blend-multiply" />
          </Link>
          <nav className="hidden md:flex items-center gap-8 font-medium text-text-secondary">
            <Link href="/pricing" className="hover:text-accent-primary transition-colors">Pricing</Link>
            <button onClick={() => setIsLoginModalOpen(true)} className="hover:text-foreground transition-colors font-medium cursor-pointer">Login</button>
            <button onClick={() => setIsLoginModalOpen(true)} className="btn-primary py-2 px-5 cursor-pointer">Sign Up</button>
          </nav>
        </div>
      </header>

      <main className="flex-1 pt-12">

        {/* Pricing Section */}
        <section className="bg-background py-24 md:py-32">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-extrabold text-foreground mb-4 tracking-tight uppercase">
                Pricing
              </h2>
              <p className="text-text-secondary font-bold tracking-wide uppercase text-sm md:text-base">
                Pay for what you need
              </p>
              
              {/* Toggle */}
              <div className="mt-8 inline-flex items-center bg-white border border-gray-200 rounded-full p-1 shadow-sm">
                <button className="px-6 py-2 rounded-full bg-white shadow text-sm font-bold text-foreground">Monthly</button>
                <button className="px-6 py-2 rounded-full text-sm font-bold text-text-secondary flex items-center gap-2">
                  Yearly <span className="bg-blue-100 text-accent-primary text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">1 Months Free!</span>
                </button>
              </div>
            </div>

            {/* Pricing Cards Container */}
            <div className="bg-accent-primary rounded-3xl p-4 md:p-6 shadow-2xl">
              <div className="flex flex-col gap-4 md:gap-6 md:grid md:grid-cols-4">
                
                {/* Free Tier */}
                <div className="bg-white rounded-2xl p-6 flex flex-col w-full md:w-auto">
                  <div className="text-center mb-8">
                    <h3 className="text-text-secondary font-bold uppercase tracking-wider mb-2">Free</h3>
                    <div className="text-5xl font-extrabold text-foreground">$0</div>
                  </div>
                  <ul className="space-y-4 mb-8 flex-1 text-sm">
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="font-medium text-foreground">Creates 1 Video</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">1 Series</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary flex items-center gap-1">0 Motion Credits <Info size={12} className="text-gray-400"/></span></li>
                    <li className="flex items-center gap-3 opacity-50"><X size={16} className="text-gray-400 shrink-0"/> <span className="text-text-secondary line-through">Auto-Post To Channel</span></li>
                    <li className="pt-4 border-t border-gray-100"></li>
                    <li className="flex items-center gap-3 opacity-50"><X size={16} className="text-gray-400 shrink-0"/> <span className="text-text-secondary line-through">Edit & Preview Videos</span></li>
                    <li className="flex items-center gap-3 opacity-50"><X size={16} className="text-gray-400 shrink-0"/> <span className="text-text-secondary line-through">HD Video Resolution</span></li>
                    <li className="flex items-center gap-3 opacity-50"><X size={16} className="text-gray-400 shrink-0"/> <span className="text-text-secondary line-through">Background Music</span></li>
                    <li className="flex items-center gap-3 opacity-50"><X size={16} className="text-gray-400 shrink-0"/> <span className="text-text-secondary line-through">Voice Cloning</span></li>
                    <li className="flex items-center gap-3 opacity-50"><X size={16} className="text-gray-400 shrink-0"/> <span className="text-text-secondary line-through">No Watermark</span></li>
                  </ul>
                  <button className="w-full bg-blue-50 text-blue-800 font-bold py-3 rounded-lg flex items-center justify-center gap-2" disabled>
                    <Info size={16} /> Temporarily paused
                  </button>
                </div>

                {/* Starter Tier */}
                <div className="bg-white rounded-2xl p-6 flex flex-col w-full md:w-auto relative shadow-xl transform md:-translate-y-2">
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-green-400 rounded-t-2xl"></div>
                  <div className="text-center mb-8">
                    <h3 className="text-text-secondary font-bold uppercase tracking-wider mb-2">Starter</h3>
                    <div className="text-5xl font-extrabold text-foreground flex items-baseline justify-center gap-1">
                      $19 <span className="text-lg text-text-secondary font-medium">/month</span>
                    </div>
                  </div>
                  <ul className="space-y-4 mb-8 flex-1 text-sm">
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="font-bold text-foreground">Posts 3 Times A Week</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary flex items-center gap-1">1 Series <Info size={12} className="text-gray-400"/></span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary flex items-center gap-1">27 Motion Credits <Info size={12} className="text-gray-400"/></span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Auto-Post To Channel</span></li>
                    <li className="pt-4 border-t border-gray-100"></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Edit & Preview Videos</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">HD Video Resolution</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Background Music</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Voice Cloning</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">No Watermark</span></li>
                  </ul>
                  <button className="w-full bg-accent-primary hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md transition-colors">
                    TRY NOW!
                  </button>
                </div>

                {/* Daily Tier */}
                <div className="bg-white rounded-2xl p-6 flex flex-col w-full md:w-auto">
                  <div className="text-center mb-8">
                    <h3 className="text-text-secondary font-bold uppercase tracking-wider mb-2">Daily</h3>
                    <div className="text-5xl font-extrabold text-foreground flex items-baseline justify-center gap-1">
                      $39 <span className="text-lg text-text-secondary font-medium">/month</span>
                    </div>
                  </div>
                  <ul className="space-y-4 mb-8 flex-1 text-sm">
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="font-bold text-foreground">Posts Once A Day</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary flex items-center gap-1">1 Series <Info size={12} className="text-gray-400"/></span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary flex items-center gap-1">62 Motion Credits <Info size={12} className="text-gray-400"/></span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Auto-Post To Channel</span></li>
                    <li className="pt-4 border-t border-gray-100"></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Edit & Preview Videos</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">HD Video Resolution</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Background Music</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Voice Cloning</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">No Watermark</span></li>
                  </ul>
                  <button className="w-full bg-accent-primary hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md transition-colors">
                    TRY NOW!
                  </button>
                </div>

                {/* Hardcore Tier */}
                <div className="bg-white rounded-2xl p-6 flex flex-col w-full md:w-auto">
                  <div className="text-center mb-8">
                    <h3 className="text-text-secondary font-bold uppercase tracking-wider mb-2">Hardcore</h3>
                    <div className="text-5xl font-extrabold text-foreground flex items-baseline justify-center gap-1">
                      $69 <span className="text-lg text-text-secondary font-medium">/month</span>
                    </div>
                  </div>
                  <ul className="space-y-4 mb-8 flex-1 text-sm">
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="font-bold text-foreground">Posts Twice A Day</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary flex items-center gap-1">1 Series <Info size={12} className="text-gray-400"/></span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary flex items-center gap-1">124 Motion Credits <Info size={12} className="text-gray-400"/></span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Auto-Post To Channel</span></li>
                    <li className="pt-4 border-t border-gray-100"></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Edit & Preview Videos</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">HD Video Resolution</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Background Music</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">Voice Cloning</span></li>
                    <li className="flex items-center gap-3"><Check size={16} className="text-green-500 shrink-0"/> <span className="text-text-secondary">No Watermark</span></li>
                  </ul>
                  <button className="w-full bg-accent-primary hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md transition-colors">
                    TRY NOW!
                  </button>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="bg-white py-24 md:py-32">
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-extrabold text-foreground mb-4 tracking-tight uppercase">
                Frequently Asked Questions
              </h2>
              <p className="text-text-secondary font-bold tracking-wide uppercase text-sm md:text-base">
                Have a question? We have answers.
              </p>
            </div>

            {/* Series & Videos */}
            <div className="mb-12">
              <h3 className="text-lg font-bold text-accent-primary uppercase tracking-wide border-b-2 border-accent-primary inline-block pb-2 mb-6">
                Series & Videos
              </h3>
              
              <div className="space-y-3">
                {[
                  "What is a Series?",
                  "Can I create videos in any niche?",
                  "What social media platforms do you support posting to?",
                  "Are the videos unique?",
                  "Can I edit the videos?",
                  "How do custom prompts work?",
                  "How many videos can I create per day?",
                  "Why am I not getting many views?",
                  "Can I replace an existing series with a new one?",
                  "How do I create a video?",
                  "Can I adjust the video length?",
                  "Do I own the videos?",
                  "Does the platform support multiple languages?",
                  "Are there any types of content that are not allowed?",
                  "Can this make long form content?",
                  "What are image credits?",
                  "What are motion credits?"
                ].map((q, i) => (
                  <div key={i} className="flex justify-between items-center p-5 border border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 transition-colors bg-white">
                    <span className="font-bold text-foreground text-sm md:text-base">{q}</span>
                    <Plus size={20} className="text-accent-primary shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            {/* Billing */}
            <div>
              <h3 className="text-lg font-bold text-accent-primary uppercase tracking-wide border-b-2 border-accent-primary inline-block pb-2 mb-6">
                Billing
              </h3>
              
              <div className="space-y-3">
                {[
                  "Is there a free trial?",
                  "Can I cancel at anytime?",
                  "How does the membership work?",
                  "Can I get a refund?",
                  "Can I upgrade or downgrade my subscription?",
                  "Can I have multiple plans?"
                ].map((q, i) => (
                  <div key={i} className="flex justify-between items-center p-5 border border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 transition-colors bg-white">
                    <span className="font-bold text-foreground text-sm md:text-base">{q}</span>
                    <Plus size={20} className="text-accent-primary shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* CTA Section */}
      <section className="bg-background py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-10 md:p-16 text-center shadow-2xl relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3"></div>

            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">
                Your faceless channel could be<br className="hidden md:block"/> posting tomorrow.
              </h2>
              <p className="text-blue-100 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
                Set up a series in minutes and let Assemblyreel create and publish for you on autopilot. Join thousands of creators growing while they sleep.
              </p>

              <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 mb-10 text-white text-sm font-semibold">
                <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-blue-300"/> Set up in minutes — no filming or editing</div>
                <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-blue-300"/> Auto-posts to TikTok, YouTube & Instagram</div>
                <div className="flex items-center gap-2"><CheckCircle2 size={18} className="text-blue-300"/> Cancel anytime</div>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button className="bg-white text-blue-700 hover:bg-gray-50 font-bold py-4 px-8 rounded-lg shadow-lg transition-colors text-lg">
                  Start Creating Free
                </button>
                <button className="bg-transparent border-2 border-blue-400 text-white hover:bg-white/10 font-bold py-4 px-8 rounded-lg transition-colors text-lg">
                  View Pricing
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gradient-to-br from-blue-700 to-blue-900 pt-20 pb-10 px-6 text-blue-100">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8 mb-16">
            
            {/* Brand Column */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 text-white font-black text-2xl tracking-tight mb-6">
                 <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                   <div className="w-4 h-4 bg-accent-primary rounded-full"></div>
                 </div>
                 Assemblyreel
              </div>
              <p className="text-sm leading-relaxed mb-8 max-w-sm text-blue-200">
                Assemblyreel automatically creates, schedules, and posts faceless videos for you, on auto-pilot. Each video is unique and customized to your topic.
              </p>
              <div className="text-xs text-blue-300 font-medium">
                Assemblyreel.io © 2026
              </div>
            </div>

            {/* Links Columns */}
            <div>
              <h4 className="text-white font-bold mb-6 tracking-wide">Company</h4>
              <ul className="space-y-3 text-sm text-blue-200">
                <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Affiliates</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Contact Us</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6 tracking-wide">Support</h4>
              <ul className="space-y-3 text-sm text-blue-200">
                <li><Link href="#" className="hover:text-white transition-colors">FAQ</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Terms & Conditions</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Google API Disclosure</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Articles</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Custom Prompt Tool</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6 tracking-wide">Alternatives</h4>
              <ul className="space-y-3 text-sm text-blue-200">
                <li><Link href="#" className="hover:text-white transition-colors">Faceless.video</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Vadoo AI</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Nullface AI</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Smart Short AI</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Crayo AI</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">AIVideo.com</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">AI Music Video Generator</Link></li>
              </ul>
            </div>

          </div>

          <div className="pt-8 border-t border-blue-800/50 flex flex-col md:flex-row justify-between items-center gap-4">
             <div className="flex flex-wrap items-center gap-6">
                <Link href="#" className="text-blue-300 hover:text-white transition-colors flex items-center gap-2 text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                  Facebook
                </Link>
                <Link href="#" className="text-blue-300 hover:text-white transition-colors flex items-center gap-2 text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg>
                  YouTube
                </Link>
                <Link href="#" className="text-blue-300 hover:text-white transition-colors flex items-center gap-2 text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                  Instagram
                </Link>
             </div>
          </div>
        </div>
      </footer>

      {/* Login Modal */}
      <AnimatePresence>
        {isLoginModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setIsLoginModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-8 md:p-10 w-full max-w-md shadow-2xl relative border border-gray-100 flex flex-col items-center gap-6"
            >
              <button 
                onClick={() => setIsLoginModalOpen(false)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>

              <div className="text-center w-full">
                <div className="overflow-hidden w-[220px] h-12 mx-auto mb-6">
                  <img src="/logo.jpg" alt="Assemblyreels Logo" className="w-full h-full object-contain scale-[3.5] mix-blend-multiply" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">Welcome Back</h2>
                <p className="text-text-secondary mt-1">Sign in to your media factory</p>
              </div>

              <form onSubmit={handleLogin} className="w-full flex flex-col gap-4 mt-2">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Email Address</label>
                  <input type="email" required className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none transition-all" placeholder="you@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Password</label>
                  <input type="password" required className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none transition-all" placeholder="••••••••" />
                </div>
                <button type="submit" className="btn-primary w-full py-3 mt-2 text-lg">
                  Sign In
                </button>
              </form>

              <div className="text-sm text-text-secondary w-full text-center mt-2">
                Need an account? <button onClick={() => setIsLoginModalOpen(true)} className="text-accent-primary font-semibold hover:underline">Sign up</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
