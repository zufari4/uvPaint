import PixelateWorker from "./pixelate.worker?worker&inline";
import type { PixelateOptions, PixelateSource } from "./pixelate";

type Results = Uint8ClampedArray<ArrayBuffer>[];

/** Runs the filter off the UI thread so the sliders stay responsive on large textures. */
export class PixelateRunner {
  private worker = new PixelateWorker();
  private id = 0;
  private pending = new Map<number, { resolve: (r: Results | null) => void; reject: (e: Error) => void }>();
  constructor(sources: PixelateSource[]) {
    this.worker.onmessage = (event: MessageEvent<{ id: number; results?: Results; error?: string }>) => {
      const job = this.pending.get(event.data.id);
      this.pending.delete(event.data.id);
      if (event.data.error) job?.reject(new Error(event.data.error));
      else job?.resolve(event.data.results!);
    };
    this.worker.onerror = (event) => {
      event.preventDefault();
      const error = new Error(event.message || "Smart pixelate failed.");
      this.pending.forEach((job) => job.reject(error));
      this.pending.clear();
    };
    // The worker owns the source copies; the layer canvases keep their own pixels.
    this.worker.postMessage({ type: "init", sources }, sources.flatMap((s) => (s.weight ? [s.data.buffer, s.weight.buffer] : [s.data.buffer])));
  }
  render(options: PixelateOptions) {
    const id = ++this.id;
    return new Promise<Results | null>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "render", id, options });
    });
  }
  dispose() {
    this.worker.terminate();
    this.pending.forEach((job) => job.resolve(null));
    this.pending.clear();
  }
}
