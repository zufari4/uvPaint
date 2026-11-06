import { smartPixelate, type PixelateOptions, type PixelateSource } from "./pixelate";

let sources: PixelateSource[] = [];
self.onmessage = (event: MessageEvent<{ type: "init"; sources: PixelateSource[] } | { type: "render"; id: number; options: PixelateOptions }>) => {
  const message = event.data;
  if (message.type === "init") {
    sources = message.sources;
    return;
  }
  try {
    const results = sources.map((s) => smartPixelate(s.data, s.width, s.height, message.options, s.weight));
    self.postMessage({ id: message.id, results }, { transfer: results.map((r) => r.buffer) });
  } catch (error) {
    self.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) });
  }
};
