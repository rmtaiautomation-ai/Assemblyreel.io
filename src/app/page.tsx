"use client";
import Link from "next/link";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { PlayCircle, Zap, CheckCircle2, Clock, TrendingUp, DollarSign, Layers, Sparkles, EyeOff, VideoOff, CalendarX, Film, Wand2, Plus, Check, X, Info } from "lucide-react";

export default function LandingPage() {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    document.cookie = "demo_auth=true; path=/";
    window.location.href = '/workspaces';
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

      {/* Hero Section */}
      <main className="flex-1">
        <section className="max-w-7xl mx-auto px-6 py-20 lg:py-32 flex flex-col lg:flex-row items-center gap-16">
          
          {/* Left Column: Copy & CTAs */}
          <article className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-accent-primary text-xs font-bold tracking-wide uppercase mb-8">
              <Zap size={14} className="fill-accent-primary text-accent-primary" /> 
              AI Faceless Video Automation
            </div>
            
            <h1 className="text-5xl lg:text-6xl font-extrabold text-foreground tracking-tight leading-[1.1] mb-6">
              Grow a Faceless Channel That <span className="text-accent-primary">Runs Itself.</span>
            </h1>
            
            <p className="text-lg lg:text-xl text-text-secondary mb-8 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Assemblyreel writes, generates, and auto-posts unique short-form videos to TikTok, YouTube & Instagram every day — so you build an audience and revenue without ever filming, editing, or showing your face.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-6">
              <button onClick={() => setIsLoginModalOpen(true)} className="btn-primary text-lg px-8 py-4 w-full sm:w-auto shadow-lg shadow-blue-500/20 cursor-pointer">
                Start Creating Free
              </button>
              <Link href="/pricing" className="btn-secondary text-lg px-8 py-4 w-full sm:w-auto">
                See Plans & Pricing
              </Link>
            </div>
            
            <p className="text-sm text-text-secondary font-medium mb-10">
              No credit card required • Cancel anytime
            </p>
            
            <div className="flex items-center justify-center lg:justify-start gap-2 text-sm text-text-secondary border-t border-gray-100 pt-8 mt-4">
              <div className="flex -space-x-2 mr-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center overflow-hidden">
                     <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-300"></div>
                  </div>
                ))}
              </div>
              Trusted by <span className="font-bold text-foreground mx-1">28,000+</span> faceless creators
            </div>
          </article>
          
          {/* Right Column: Video/Demo Preview */}
          <aside className="flex-1 w-full max-w-xl relative">
            <div className="relative rounded-2xl overflow-hidden border-[8px] border-accent-primary shadow-2xl shadow-blue-900/10 bg-gray-900 aspect-video group cursor-pointer">
              {/* Fallback styling representing the video thumbnail */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 opacity-80 mix-blend-overlay"></div>
              
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-8">
                <div className="w-20 h-20 bg-red-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-300">
                   <div className="w-0 h-0 border-t-[12px] border-t-transparent border-l-[20px] border-l-white border-b-[12px] border-b-transparent ml-2"></div>
                </div>
                <h3 className="text-white font-bold text-2xl mt-6 text-center shadow-sm drop-shadow-md">
                  WANT TO AUTOMATE<br/>FACELESS VIDEOS LIKE THESE?
                </h3>
              </div>
              
              {/* Mock Player UI */}
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4 z-10">
                 <div className="flex items-center gap-4 text-white/80">
                   <PlayCircle size={20} />
                   <div className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                     <div className="h-full w-1/3 bg-red-600"></div>
                   </div>
                   <span className="text-xs font-medium">Watch on YouTube</span>
                 </div>
              </div>
            </div>
            
            {/* Decorative background blob */}
            <div className="absolute -inset-4 bg-accent-primary/10 blur-3xl rounded-full -z-10"></div>
          </aside>
          
        </section>

        {/* Stats Section */}
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <div className="text-center mb-6 flex items-center justify-center gap-3">
            <span className="text-sm font-bold text-text-secondary tracking-widest uppercase">Auto-posts to</span>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 15.68a6.32 6.32 0 006.27 6.33 6.32 6.32 0 006.27-6.33V11.53a8.32 8.32 0 004.05 1.08V9.15a5.2 5.2 0 01-2-1.46z"/></svg>
              </div>
              <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
                <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.376.55 9.376.55s7.505 0 9.377-.55a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center">
                <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-50/40 border border-blue-100/60 rounded-2xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4 shadow-sm">
            <div className="flex-1 text-center">
              <h2 className="text-4xl lg:text-5xl font-extrabold text-accent-primary mb-2 tracking-tight">2.5M+</h2>
              <p className="text-text-secondary font-medium text-sm md:text-base">Videos generated</p>
            </div>
            
            <div className="hidden md:block w-px h-16 bg-blue-100/80"></div>
            
            <div className="flex-1 text-center">
              <h2 className="text-4xl lg:text-5xl font-extrabold text-accent-primary mb-2 tracking-tight">800M+</h2>
              <p className="text-text-secondary font-medium text-sm md:text-base">Views driven for creators</p>
            </div>
            
            <div className="hidden md:block w-px h-16 bg-blue-100/80"></div>
            
            <div className="flex-1 text-center">
              <h2 className="text-4xl lg:text-5xl font-extrabold text-accent-primary mb-2 tracking-tight">28,000+</h2>
              <p className="text-text-secondary font-medium text-sm md:text-base">Faceless creators</p>
            </div>
          </div>
        </section>

        {/* Examples Section */}
        <section className="w-full bg-gradient-to-br from-blue-600 to-blue-900 py-24 relative overflow-hidden">
          {/* Decorative Blobs */}
          <div className="absolute top-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] bg-black/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3"></div>
          
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4 tracking-tight uppercase">
                Unique Videos Each Time
              </h2>
              <p className="text-blue-100 font-medium tracking-wide uppercase text-sm md:text-base">
                Choose a video in any niche
              </p>
            </div>
            
            <div className="relative w-full overflow-hidden flex items-center justify-center [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] py-4">
              <motion.div 
                initial={{ x: 0 }}
                animate={{ x: "-25%" }}
                transition={{ repeat: Infinity, ease: "linear", duration: 30, repeatType: "loop" }}
                className="flex w-max"
              >
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex gap-4 md:gap-6 pr-4 md:pr-6">
                    {[
                      { title: "FESTIVAL OF", views: "43.7k", style: "Epic History", bg: "bg-gradient-to-br from-purple-500 to-indigo-600" },
                      { title: "THE WHISPERING", views: "28.8k", style: "Childrens Book", bg: "bg-gradient-to-br from-emerald-400 to-teal-700" },
                      { title: "HOW DID", views: "62.3k", style: "AutoShorts V2", bg: "bg-gradient-to-br from-orange-400 to-red-600" },
                      { title: "REVEALING A", views: "22.6k", style: "UGC Hook", bg: "bg-gradient-to-br from-pink-400 to-rose-600" },
                      { title: "SCARY FACTS", views: "14.1k", style: "Dark Mystery", bg: "bg-slate-800" },
                      { title: "SPACE SECRETS", views: "89.2k", style: "Sci-Fi Lore", bg: "bg-gradient-to-br from-blue-400 to-cyan-600" }
                    ].map((card, j) => (
                      <div key={j} className="w-[160px] md:w-[200px] shrink-0 flex flex-col gap-3 group cursor-pointer transition-transform duration-300 hover:-translate-y-4">
                        <div className="relative aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 group-hover:border-white/30 transition-all">
                          <div className={`absolute inset-0 ${card.bg}`}></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <h3 className="text-white font-black text-xl italic text-center leading-tight drop-shadow-md px-2">
                              {card.title}
                            </h3>
                          </div>
                          <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs font-bold drop-shadow-md">
                            <PlayCircle size={14} className="fill-white/20" /> {card.views}
                          </div>
                        </div>
                        <div className="text-center text-blue-200 text-xs font-semibold">
                          Style: {card.style}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* Benefits/Features Grid */}
        <section className="bg-white py-24 md:py-32">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16 md:mb-20">
              <h2 className="text-3xl md:text-5xl font-extrabold text-foreground mb-4 tracking-tight uppercase">
                Why Creators Choose Assemblyreel
              </h2>
              <p className="text-text-secondary font-bold tracking-wide uppercase text-sm md:text-base">
                Turn one setup into a content machine
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {/* Card 1 */}
              <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-accent-primary flex items-center justify-center mb-6 shadow-sm">
                  <Clock className="text-white" size={24} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">Save hours each week</h3>
                <p className="text-text-secondary text-sm md:text-base leading-relaxed">
                  No scripting, voiceovers, editing, or uploading. Set a series once and we produce and post fresh videos on autopilot — daily.
                </p>
              </div>

              {/* Card 2 */}
              <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-accent-primary flex items-center justify-center mb-6 shadow-sm">
                  <TrendingUp className="text-white" size={24} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">Post consistently, grow faster</h3>
                <p className="text-text-secondary text-sm md:text-base leading-relaxed">
                  The algorithm rewards consistency. We keep your channels fed with new content every day so your audience compounds instead of stalling.
                </p>
              </div>

              {/* Card 3 */}
              <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-accent-primary flex items-center justify-center mb-6 shadow-sm">
                  <DollarSign className="text-white" size={24} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">Built to monetize</h3>
                <p className="text-text-secondary text-sm md:text-base leading-relaxed">
                  More views means more ad revenue, affiliate clicks, and product sales. Run multiple income streams from channels that run themselves.
                </p>
              </div>

              {/* Card 4 */}
              <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-accent-primary flex items-center justify-center mb-6 shadow-sm">
                  <Layers className="text-white" size={24} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">Scale to many channels</h3>
                <p className="text-text-secondary text-sm md:text-base leading-relaxed">
                  Spin up multiple series across niches and platforms from one dashboard. Test what sticks and double down — without multiplying your workload.
                </p>
              </div>

              {/* Card 5 */}
              <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-accent-primary flex items-center justify-center mb-6 shadow-sm">
                  <Sparkles className="text-white" size={24} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">Unique, on-brand every time</h3>
                <p className="text-text-secondary text-sm md:text-base leading-relaxed">
                  Pick from dozens of art styles or write a custom prompt. Every video is generated fresh — never recycled, never duplicate-flagged.
                </p>
              </div>

              {/* Card 6 */}
              <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-accent-primary flex items-center justify-center mb-6 shadow-sm">
                  <EyeOff className="text-white" size={24} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 tracking-tight">Stay fully faceless</h3>
                <p className="text-text-secondary text-sm md:text-base leading-relaxed">
                  No camera, no microphone, no editing skills. Build a real brand and audience without ever showing your face or voice.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="bg-background py-24 md:py-32 relative overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 relative z-10">
            <div className="text-center mb-24">
              <h2 className="text-3xl md:text-5xl font-extrabold text-foreground mb-4 tracking-tight uppercase">
                How Does It Work?
              </h2>
              <p className="text-text-secondary font-bold tracking-wide uppercase text-sm md:text-base">
                Faceless channels on auto-pilot
              </p>
            </div>

            <div className="relative">
              {/* Dashed line connecting steps (hidden on mobile for simplicity, visible on lg) */}
              <div className="hidden lg:block absolute left-1/2 top-24 bottom-24 w-0.5 border-l-2 border-dashed border-blue-200 -translate-x-1/2 -z-10"></div>

              {/* Step 1 */}
              <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-24 mb-24 lg:mb-32">
                <div className="flex-1 w-full lg:text-right order-2 lg:order-1 relative">
                  <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 md:p-10 shadow-lg relative mx-auto lg:ml-auto max-w-lg">
                    {/* Mock UI: Step 1 */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                      <div className="p-4 border-b border-gray-100 flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-400"></div>
                        <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                        <div className="w-3 h-3 rounded-full bg-green-400"></div>
                      </div>
                      <div className="p-6 space-y-5 text-left">
                        <div>
                          <div className="text-xs font-semibold text-text-secondary mb-1">Video Language</div>
                          <div className="h-10 rounded-md border border-gray-200 flex items-center px-3 text-sm text-foreground">English 🇺🇸</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-text-secondary mb-1">Duration Preference</div>
                          <div className="h-10 rounded-md border border-gray-200 flex items-center px-3 text-sm text-foreground">60 to 90 seconds</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-text-secondary">Background Music</div>
                          <div className="w-10 h-5 bg-accent-primary rounded-full relative"><div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div></div>
                        </div>
                        <div className="pt-4 border-t border-gray-100">
                          <button className="w-full bg-accent-primary text-white text-sm font-bold py-3 rounded-md shadow-sm">
                            Create Series ✨
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 order-1 lg:order-2">
                  <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border-2 border-accent-primary text-accent-primary font-bold text-sm mb-6 bg-white shadow-sm">
                    Step 1
                  </div>
                  <h3 className="text-3xl font-extrabold text-foreground mb-4">Create a Series</h3>
                  <p className="text-lg text-text-secondary leading-relaxed max-w-md">
                    Choose a topic for your faceless video series. Select from our preset list or create a custom prompt. Our AI will begin crafting your first unique video immediately.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-24 mb-24 lg:mb-32">
                <div className="flex-1 lg:text-right order-1">
                  <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border-2 border-accent-primary text-accent-primary font-bold text-sm mb-6 bg-white shadow-sm lg:ml-auto">
                    Step 2
                  </div>
                  <h3 className="text-3xl font-extrabold text-foreground mb-4">Preview and Customize</h3>
                  <p className="text-lg text-text-secondary leading-relaxed max-w-md lg:ml-auto">
                    Review your AI-generated video before it's posted. Edit the script, title, images, or background music as needed. Each video is uniquely created for your series.
                  </p>
                </div>
                <div className="flex-1 w-full order-2 relative">
                  <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 md:p-10 shadow-lg relative mx-auto lg:mr-auto max-w-lg">
                    {/* Mock UI: Step 2 */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[300px]">
                      <div className="bg-slate-900 p-4 pb-12 text-white">
                        <div className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">Upcoming Video</div>
                        <div className="text-sm">Edit the details of your upcoming video</div>
                      </div>
                      <div className="p-4 flex-1 -mt-8 relative z-10">
                        <div className="bg-white rounded-lg shadow-md border border-gray-100 p-4 h-full flex flex-col">
                           <div className="text-center font-bold text-sm text-foreground border-b border-gray-100 pb-2 mb-4">Media Editor</div>
                           <div className="flex gap-2 mb-4 overflow-hidden">
                             {[1,2,3,4,5].map(i => (
                               <div key={i} className="w-16 h-24 shrink-0 bg-gray-100 rounded-md border border-gray-200 flex flex-col items-center justify-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center"><PlayCircle size={12} className="text-white"/></div>
                               </div>
                             ))}
                           </div>
                           <div className="h-1 bg-gray-200 rounded-full w-full mb-1"><div className="h-full w-1/4 bg-accent-primary rounded-full"></div></div>
                           <div className="mt-auto">
                             <button className="bg-gray-100 text-text-secondary text-xs font-bold py-1.5 px-3 rounded">Update Video</button>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-24">
                <div className="flex-1 w-full lg:text-right order-2 lg:order-1 relative">
                  <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 md:p-10 shadow-lg relative mx-auto lg:ml-auto max-w-lg">
                    {/* Mock UI: Step 3 */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                       <div className="bg-slate-900 text-white font-bold text-sm uppercase tracking-wide p-4">Your Series</div>
                       <div className="flex flex-col divide-y divide-gray-100">
                          <div className="p-4">
                            <div className="text-sm font-semibold text-foreground">Interesting History</div>
                            <div className="text-xs text-text-secondary">Created January 18, 2024</div>
                          </div>
                          <div className="p-4 bg-blue-50/50">
                            <div className="text-sm font-semibold text-foreground">Life Pro Tips #2</div>
                            <div className="text-xs text-text-secondary">Created January 17, 2024</div>
                          </div>
                          <div className="p-4">
                            <div className="text-sm font-semibold text-foreground">Scary Stories</div>
                            <div className="text-xs text-text-secondary">Created January 3, 2024</div>
                          </div>
                          <div className="p-4">
                            <div className="text-sm font-semibold text-foreground">Bedtime Stories</div>
                            <div className="text-xs text-text-secondary">Created December 11, 2023</div>
                          </div>
                       </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 order-1 lg:order-2">
                  <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border-2 border-accent-primary text-accent-primary font-bold text-sm mb-6 bg-white shadow-sm">
                    Step 3
                  </div>
                  <h3 className="text-3xl font-extrabold text-foreground mb-4">Watch Your Channel Grow</h3>
                  <p className="text-lg text-text-secondary leading-relaxed max-w-md mb-6">
                    Edit your posting schedule, connect your channels, and let Assemblyreel handle the rest. We'll take care of creating and posting while you kick back and relax.
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shadow-sm">
                       <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 15.68a6.32 6.32 0 006.27 6.33 6.32 6.32 0 006.27-6.33V11.53a8.32 8.32 0 004.05 1.08V9.15a5.2 5.2 0 01-2-1.46z"/></svg>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shadow-sm">
                       <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.376.55 9.376.55s7.505 0 9.377-.55a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center shadow-sm">
                       <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Guarantees Section */}
        <section className="bg-white py-12 border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Card 1 */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col items-start h-full">
                <div className="flex items-center gap-3 mb-3">
                  <VideoOff className="text-accent-primary" size={24} />
                  <h4 className="font-bold text-foreground text-lg">Start free</h4>
                </div>
                <p className="text-text-secondary text-sm mb-4">Create your first videos with no credit card.</p>
                <div className="mt-auto inline-block bg-orange-50 border border-orange-200 text-orange-700 text-[10px] font-bold px-2 py-1 rounded-md tracking-wider">
                  TEMPORARILY DISABLED
                </div>
              </div>
              {/* Card 2 */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col items-start h-full">
                <div className="flex items-center gap-3 mb-3">
                  <CalendarX className="text-accent-primary" size={24} />
                  <h4 className="font-bold text-foreground text-lg">Cancel anytime</h4>
                </div>
                <p className="text-text-secondary text-sm">No contracts or lock-in. Change or cancel in one click.</p>
              </div>
              {/* Card 3 */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col items-start h-full">
                <div className="flex items-center gap-3 mb-3">
                  <Film className="text-accent-primary" size={24} />
                  <h4 className="font-bold text-foreground text-lg">Your videos are yours</h4>
                </div>
                <p className="text-text-secondary text-sm">Download and keep everything you create.</p>
              </div>
              {/* Card 4 */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col items-start h-full">
                <div className="flex items-center gap-3 mb-3">
                  <Wand2 className="text-accent-primary" size={24} />
                  <h4 className="font-bold text-foreground text-lg">No skills needed</h4>
                </div>
                <p className="text-text-secondary text-sm">No filming, editing, or software experience required.</p>
              </div>
            </div>
          </div>
        </section>
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
