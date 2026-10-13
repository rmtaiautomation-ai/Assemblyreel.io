"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import EarlyAccessSection from "./EarlyAccessSection";

interface EarlyAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EarlyAccessModal({ isOpen, onClose }: EarlyAccessModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#15181C] border border-[#353B44] shadow-2xl p-6 sm:p-8">
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-[#20242A] text-[#B5BCC6] hover:text-white flex items-center justify-center transition-colors z-10"
        >
          <X size={18} />
        </button>

        {/* Modal form content */}
        <div className="mt-2">
          <EarlyAccessSection id="modal-early-access" />
        </div>
      </div>
    </div>
  );
}
