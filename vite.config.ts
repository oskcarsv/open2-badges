import { defineConfig } from "vite";

export default defineConfig({
  // The MP4 muxer is loaded on demand and is large on its own; that is expected.
  build: { chunkSizeWarningLimit: 900 },
});
