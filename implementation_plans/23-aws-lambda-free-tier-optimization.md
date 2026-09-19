# AWS Lambda Rendering Architecture (Free Tier Optimization)

## Executive Summary
This document outlines the engineering strategy used to successfully render massive, long-form AI videos (up to 17+ minutes, ~60,000 frames at 60 FPS) in just **2 to 3 minutes** using AWS Lambda, while strictly adhering to AWS Free Tier constraints.

By utilizing a "Fat Lambda" chunking strategy and leveraging Remotion's automatic rate-limit retries, we achieved highly parallel, distributed rendering without hitting timeout, out-of-memory, or function limits.

---

## 1. The Constraints (AWS Free Tier & Remotion Limits)
To build this architecture, we had to carefully navigate three hard limits:
- **Memory & Disk Space**: AWS Free Tier caps Lambda functions at **3008 MB**. Going over this causes instant `OutOfMemory` or `ENOSPC` (Disk Full) crashes.
- **Max Chunk Limit**: Remotion has a hardcoded safety guardrail that strictly forbids spawning more than **200 concurrent functions (chunks)** for a single render.
- **Timeouts & Rate Limits**: Lambdas have an absolute maximum lifespan of **15 minutes (900 seconds)**, and Free Tier accounts strictly throttle large bursts of concurrent Lambda invocations.

---

## 2. The Strategy

### A. Aggressive Chunk Sizing (`framesPerLambda: 500`)
To render a 17-minute video at 60 FPS (approx. 60,800 frames) without exceeding the 200-function limit, we implemented a "Fat Lambda" strategy. 
- We set `framesPerLambda: 500`. 
- This forces the system to group the video into larger, denser chunks. For our 60,800 frame video, it perfectly calculates down to **~121 chunks**, safely bypassing the 200-function ceiling.
- **Why 500?** It strikes the perfect balance. It is dense enough to minimize the number of Lambdas spawned, but small enough that the uncompressed frame data easily fits inside the 3008 MB AWS disk limit without crashing.

### B. Uncapped Concurrency (Delegating to Remotion)
We intentionally **removed** any hardcoded `concurrency` restrictions from the codebase.
- **The Issue**: Remotion v4 forbids explicitly defining both `concurrency` and `framesPerLambda` simultaneously. Defining `concurrency` forces Remotion to slice chunks far too large, resulting in instant AWS disk crashes.
- **The Solution**: By defining *only* `framesPerLambda`, we give Remotion full dynamic control over the chunking math. Remotion simply fires off all ~121 chunks at once. When the AWS Free Tier throttles the burst with `TooManyRequestsException` errors, Remotion elegantly catches them and applies **exponential backoff retries** in the background until every single chunk finishes successfully.

### C. Max Timeout Safety Net
We explicitly set `timeoutInMilliseconds: 900000` (15 minutes). This ensures that the Puppeteer browser instance and Remotion orchestrator maximize the available lifespan of the AWS Lambda environment, preventing premature timeouts during heavy asset-fetching phases.

---

## 3. How to Explain This (Cheat Sheet)
If an investor, engineer, or client asks how your system renders so fast, you can explain it like this:

> *"We built a highly distributed serverless rendering pipeline on AWS Lambda. To bypass free-tier rate limits and 15-minute timeouts on massive 17-minute, 60-FPS videos, we developed a 'Fat Lambda' chunking strategy.* 
> 
> *Instead of sequential rendering, we slice the video into exact 500-frame chunks, ensuring we stay well below Remotion's 200-function ceiling while preventing memory and disk-space crashes on smaller servers. We then fire off all chunks simultaneously in parallel. We let Remotion's built-in exponential backoff engine smoothly handle any AWS concurrency throttling behind the scenes. The result is a video that would normally take 34 minutes to render completing in just 2 to 3 minutes."*
