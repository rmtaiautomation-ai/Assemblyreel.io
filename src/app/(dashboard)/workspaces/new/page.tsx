"use client";

import React from "react";
import { useRouter } from "next/navigation";
import WorkspaceForm from "@/components/ui/WorkspaceForm";

export default function NewWorkspacePage() {
  const router = useRouter();
  
  const handleSuccess = () => {
    // Route back to the main dashboard
    router.push(`/`);
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <WorkspaceForm onSuccess={handleSuccess} />
    </div>
  );
}
