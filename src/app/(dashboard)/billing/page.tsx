"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Zap, CheckCircle2, ArrowRight, Download, Receipt, Clock, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function BillingPage() {
  const [isManaging, setIsManaging] = useState(false);

  // Mock data for the frontend display
  const plan = {
    name: "Starter",
    price: "$19",
    interval: "month",
    status: "Active",
    nextBilling: "Aug 18, 2026",
    creditsTotal: 27,
    creditsUsed: 12,
  };

  const invoices = [
    { id: "INV-2026-001", date: "Jul 18, 2026", amount: "$19.00", status: "Paid" },
    { id: "INV-2026-002", date: "Jun 18, 2026", amount: "$19.00", status: "Paid" },
  ];

  const creditPercentage = (plan.creditsUsed / plan.creditsTotal) * 100;

  const handleManageBilling = async () => {
    setIsManaging(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsManaging(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Billing & Credits</h1>
        <p className="text-text-secondary mt-1">Manage your subscription, view past invoices, and track your motion credits.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Plan & Credits */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Active Plan Card */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-gray-200 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1.5 bg-accent-primary"></div>
            
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-foreground">{plan.name} Plan</h2>
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
                    {plan.status}
                  </span>
                </div>
                <div className="text-3xl font-extrabold text-foreground mb-4">
                  {plan.price}<span className="text-lg text-text-secondary font-medium">/{plan.interval}</span>
                </div>
                <p className="text-sm text-text-secondary flex items-center gap-2">
                  <Clock size={16} /> Renews on {plan.nextBilling}
                </p>
              </div>

              <div className="flex flex-col gap-3 min-w-[200px]">
                <button 
                  onClick={handleManageBilling}
                  disabled={isManaging}
                  className="bg-gray-50 hover:bg-gray-100 border border-gray-200 text-foreground font-bold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <CreditCard size={18} />
                  {isManaging ? 'Redirecting...' : 'Manage Billing'}
                </button>
                <Link href="/pricing" className="text-accent-primary font-bold text-sm text-center hover:underline">
                  Upgrade Plan
                </Link>
              </div>
            </div>
          </motion.div>

          {/* Credits Widget */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-gray-900 to-black rounded-3xl p-6 md:p-8 shadow-xl text-white relative overflow-hidden"
          >
            {/* Decorative background glow */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent-primary/30 rounded-full blur-3xl"></div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                  <Zap className="text-accent-primary" size={24} />
                </div>
                <h3 className="text-xl font-bold">Motion Credits</h3>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
                
                {/* Circular Progress (CSS driven) */}
                <div className="relative w-32 h-32 shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle 
                      cx="64" cy="64" r="56" 
                      className="stroke-gray-800" 
                      strokeWidth="12" 
                      fill="none" 
                    />
                    <circle 
                      cx="64" cy="64" r="56" 
                      className="stroke-accent-primary" 
                      strokeWidth="12" 
                      fill="none" 
                      strokeDasharray={`${2 * Math.PI * 56}`}
                      strokeDashoffset={`${2 * Math.PI * 56 * (1 - (plan.creditsUsed / plan.creditsTotal))}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black">{plan.creditsTotal - plan.creditsUsed}</span>
                    <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Left</span>
                  </div>
                </div>

                <div className="flex-1 w-full space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2 font-medium">
                      <span className="text-gray-300">{plan.creditsUsed} Used</span>
                      <span className="text-gray-300">{plan.creditsTotal} Total</span>
                    </div>
                    {/* Linear Progress Bar */}
                    <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${creditPercentage}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-blue-500 to-accent-primary rounded-full"
                      ></motion.div>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-400">
                    Credits are consumed when generating videos. Your balance resets to {plan.creditsTotal} on {plan.nextBilling}.
                  </p>
                </div>
              </div>

              <button className="w-full bg-white/10 hover:bg-white/20 transition-colors py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-sm backdrop-blur-sm border border-white/5">
                <Sparkles size={16} /> Need more credits? Upgrade your plan
              </button>
            </div>
          </motion.div>

        </div>

        {/* Right Column: Features & History */}
        <div className="space-y-8">
          
          {/* Features Included */}
          <motion.div 
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm"
          >
            <h3 className="font-bold text-foreground mb-4 uppercase tracking-wider text-sm border-b border-gray-100 pb-3">
              Included in {plan.name}
            </h3>
            <ul className="space-y-4">
              {[
                "Posts 3 Times A Week",
                "1 Active Series",
                "27 Motion Credits /mo",
                "Auto-Post To Channel",
                "HD Video Resolution",
                "Voice Cloning",
                "No Watermark"
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 size={18} className="text-green-500 shrink-0 mt-0.5" />
                  <span className="text-foreground font-medium">{feature}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Billing History */}
          <motion.div 
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm"
          >
            <h3 className="font-bold text-foreground mb-4 uppercase tracking-wider text-sm border-b border-gray-100 pb-3 flex items-center gap-2">
              <Receipt size={16} /> Billing History
            </h3>
            
            <div className="space-y-4">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between group">
                  <div>
                    <div className="font-bold text-sm text-foreground">{inv.amount}</div>
                    <div className="text-xs text-text-secondary">{inv.date}</div>
                  </div>
                  <button className="p-2 text-gray-400 hover:text-accent-primary hover:bg-blue-50 rounded-lg transition-colors" title="Download Receipt">
                    <Download size={16} />
                  </button>
                </div>
              ))}
            </div>
            
            <button className="mt-6 w-full text-center text-sm font-bold text-accent-primary hover:underline flex items-center justify-center gap-1">
              View All History <ArrowRight size={14} />
            </button>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
