# Server services

This directory contains server-only application services used by thin Next.js route
handlers. HTTP parsing and response formatting stay under `src/app/api`; reusable
rendering, storage, job-state, and external-service behavior belongs here.

`rendering/` owns both local and Lambda exports. The load-bearing Remotion entry point
remains `src/remotion/index.ts`.
