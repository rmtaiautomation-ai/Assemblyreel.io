"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Film, Menu, X, Sparkles, ArrowRight } from "lucide-react";
import { AccountNavigation } from "@/features/auth/components/AccountNavigation";

interface NavbarProps {
  onRequestEarlyAccess: () => void;
}

export default function Navbar({ onRequestEarlyAccess }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    if (mobileMenuOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [mobileMenuOpen]);

  const navLinks = [
    { label: "Product", href: "#product" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Control", href: "#control" },
    { label: "Graphics", href: "#graphics" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-[#0A0B0D]/85 backdrop-blur-md border-b border-[#353B44]/60 py-3 shadow-lg shadow-black/40"
          : "bg-transparent border-b border-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 text-white font-bold text-xl tracking-tight group"
        >
          <div className="w-9 h-9 rounded-lg bg-[#15181C] border border-[#353B44] flex items-center justify-center text-[#13EF93] group-hover:border-[#13EF93]/60 transition-colors shadow-inner">
            <Film size={20} className="stroke-[2.2]" />
          </div>
          <span className="flex items-center">
            Assembly<span className="text-[#13EF93]">Reel</span>
          </span>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#B5BCC6]">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="hover:text-white transition-colors duration-150"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop Action */}
        <div className="hidden md:flex items-center gap-4">
          <AccountNavigation />
          <button
            onClick={onRequestEarlyAccess}
            className="mkt-btn-primary text-xs px-4 py-2"
          >
            <Sparkles size={14} className="stroke-[2.5]" />
            Request Early Access
          </button>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          className="md:hidden w-10 h-10 rounded-lg bg-[#15181C] border border-[#353B44] flex items-center justify-center text-[#F3F4F6] hover:text-[#13EF93] transition-colors"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[65px] bg-[#0A0B0D]/95 backdrop-blur-xl border-b border-[#353B44] p-6 shadow-2xl transition-all">
          <nav className="flex flex-col gap-4 text-base font-medium text-[#B5BCC6]">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 hover:text-white transition-colors border-b border-[#20242A]"
              >
                {link.label}
              </a>
            ))}
            <AccountNavigation />
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onRequestEarlyAccess();
              }}
              className="mkt-btn-primary w-full py-3 mt-4 text-center justify-center text-sm"
            >
              Request Early Access
              <ArrowRight size={16} />
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
