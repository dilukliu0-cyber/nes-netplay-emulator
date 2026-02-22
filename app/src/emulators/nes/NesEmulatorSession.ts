import { Controller, NES } from "jsnes";
import type { EmulatorSession, EmulatorSessionArgs, InputState } from "../types";
import { bytesToBinaryString } from "../shared/buffer";

const buttonOrder: Array<{ key: keyof InputState; button: number }> = [
  { key: "up", button: Controller.BUTTON_UP },
  { key: "down", button: Controller.BUTTON_DOWN },
  { key: "left", button: Controller.BUTTON_LEFT },
  { key: "right", button: Controller.BUTTON_RIGHT },
  { key: "a", button: Controller.BUTTON_A },
  { key: "b", button: Controller.BUTTON_B },
  { key: "start", button: Controller.BUTTON_START },
  { key: "select", button: Controller.BUTTON_SELECT }
];

export class NesEmulatorSession implements EmulatorSession {
  private readonly onError?: (err: Error) => void;
  private readonly onFps?: (fps: number) => void;
  private nes: NES | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private frameImage: ImageData | null = null;
  private running = false;
  private rafId: number | null = null;
  private inputState: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    start: false,
    select: false
  };
  private previousApplied: InputState = { ...this.inputState };

  public constructor(args: EmulatorSessionArgs) {
    this.onError = args.onError;
    this.onFps = args.onFps;
  }

  public async mount(canvas: HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("NES: canvas context is not available");
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.frameImage = ctx.createImageData(256, 240);
    this.nes = new NES({
      onFrame: (frameBuffer: number[]) => {
        const frame = this.frameImage;
        const renderCtx = this.ctx;
        if (!frame || !renderCtx) return;
        for (let i = 0; i < frameBuffer.length; i += 1) {
          const p = frameBuffer[i];
          const o = i * 4;
          frame.data[o] = p & 255;
          frame.data[o + 1] = (p >> 8) & 255;
          frame.data[o + 2] = (p >> 16) & 255;
          frame.data[o + 3] = 255;
        }
        renderCtx.imageSmoothingEnabled = false;
        renderCtx.putImageData(frame, 0, 0);
      }
    });
  }

  public async loadRom(romBytes: Uint8Array): Promise<void> {
    if (!this.nes) {
      throw new Error("NES: session is not mounted");
    }
    try {
      this.nes.loadROM(bytesToBinaryString(romBytes));
    } catch (error) {
      const err = error instanceof Error ? error : new Error("NES: failed to load ROM");
      this.onError?.(err);
      throw err;
    }
  }

  public start(): void {
    if (!this.nes || this.running) return;
    this.running = true;
    let lastFpsAt = performance.now();
    let frames = 0;
    const loop = () => {
      if (!this.running || !this.nes) return;
      this.applyInput();
      this.nes.frame();
      frames += 1;
      const now = performance.now();
      if (now - lastFpsAt >= 1000) {
        this.onFps?.(frames);
        frames = 0;
        lastFpsAt = now;
      }
      this.rafId = window.requestAnimationFrame(loop);
    };
    this.rafId = window.requestAnimationFrame(loop);
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public reset(): void {
    // jsnes has no stable hard reset API in current typings.
  }

  public saveState(): Uint8Array {
    if (!this.nes) {
      throw new Error("NES: session is not mounted");
    }
    const serializer = this.nes as NES & { toJSON?: () => unknown };
    if (typeof serializer.toJSON !== "function") {
      throw new Error("NES: save state is not supported by current core");
    }
    const raw = JSON.stringify(serializer.toJSON());
    return new TextEncoder().encode(raw);
  }

  public loadState(stateBytes: Uint8Array): void {
    if (!this.nes) {
      throw new Error("NES: session is not mounted");
    }
    const loader = this.nes as NES & { fromJSON?: (snapshot: unknown) => void };
    if (typeof loader.fromJSON !== "function") {
      throw new Error("NES: load state is not supported by current core");
    }
    const raw = new TextDecoder().decode(stateBytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("NES: save state is corrupted");
    }
    loader.fromJSON(parsed);
  }

  public setInput(p1: InputState, _p2?: InputState): void {
    this.inputState = {
      up: Boolean(p1.up),
      down: Boolean(p1.down),
      left: Boolean(p1.left),
      right: Boolean(p1.right),
      a: Boolean(p1.a),
      b: Boolean(p1.b),
      start: Boolean(p1.start),
      select: Boolean(p1.select)
    };
  }

  public setVolume(_v: number): void {
    // Audio is handled by legacy NES path in current app.
  }

  public destroy(): void {
    this.stop();
    this.nes = null;
    this.canvas = null;
    this.ctx = null;
    this.frameImage = null;
  }

  private applyInput(): void {
    if (!this.nes) return;
    for (const mapping of buttonOrder) {
      const nextPressed = Boolean(this.inputState[mapping.key]);
      const prevPressed = Boolean(this.previousApplied[mapping.key]);
      if (nextPressed === prevPressed) continue;
      if (nextPressed) {
        this.nes.buttonDown(1, mapping.button);
      } else {
        this.nes.buttonUp(1, mapping.button);
      }
      this.previousApplied[mapping.key] = nextPressed;
    }
  }
}
