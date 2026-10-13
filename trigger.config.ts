import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? "ai-video-generation-saas",
  // Only secured tasks are deployed. Retire any previous autopilot deployment separately.
  dirs: ["./src/trigger/account-access"],
  build: { extensions: [{ name:"worker-server-only-marker", onBuildStart(context) {
    context.registerPlugin({name:"worker-server-only-marker",setup(build) {
      build.onResolve({filter:/^server-only$/},()=>({path:"server-only",namespace:"worker-marker"}));
      build.onLoad({filter:/.*/,namespace:"worker-marker"},()=>({contents:"export {};",loader:"js"}));
    }});
  }}] },
  logLevel: "log",
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
});
