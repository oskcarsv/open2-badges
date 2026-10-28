/**
 * Turns a canvas drawing into an MP4, frame by frame, in the browser. Nothing
 * is recorded in real time: each frame is drawn at its exact instant and
 * handed to the phone's own H.264 encoder (WebCodecs), so a slow phone takes
 * longer but never drops a frame, and the file is the MP4 every app accepts.
 *
 * The muxer is loaded on demand, so pages pay for it only when someone asks
 * for a video.
 */

export type CanvasVideo = {
  width: number;
  height: number;
  seconds: number;
  fps: number;
  /** Paints the frame at `t` seconds onto `canvas`. */
  drawFrame: (canvas: HTMLCanvasElement, t: number) => void;
  onProgress?: (done: number) => void;
  signal?: AbortSignal;
};

/** Whether this browser can encode an MP4 of that size at all. */
export async function canEncodeCanvasVideo(width: number, height: number): Promise<boolean> {
  if (typeof window === "undefined" || typeof window.VideoEncoder === "undefined") return false;
  try {
    const { canEncodeVideo } = await import("mediabunny");
    return await canEncodeVideo("avc", { width, height });
  } catch {
    return false;
  }
}

export async function encodeCanvasVideo({
  width,
  height,
  seconds,
  fps,
  drawFrame,
  onProgress,
  signal,
}: CanvasVideo): Promise<Blob> {
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH } = await import("mediabunny");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const output = new Output({
    // The index goes at the front so the video starts playing before it has
    // fully loaded wherever it is posted.
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, { codec: "avc", bitrate: QUALITY_HIGH, keyFrameInterval: 1 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i += 1) {
    if (signal?.aborted) {
      await output.cancel();
      throw new DOMException("Aborted", "AbortError");
    }
    drawFrame(canvas, i / fps);
    await source.add(i / fps, 1 / fps);
    onProgress?.((i + 1) / frames);
  }
  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("empty_video");
  return new Blob([buffer], { type: "video/mp4" });
}
