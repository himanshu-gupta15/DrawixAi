import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows a second instance (e.g. benchmarks) to run without sharing the .next dev lock.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Keep the dev-mode badge out of demo recordings.
  devIndicators: false,
  // Native / heavy server-only packages are loaded from node_modules at runtime
  // instead of being bundled (ONNX runtime for local embeddings + Whisper ASR).
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp", "@prisma/client", "unpdf"],
};

export default nextConfig;
