import { Nostalgist } from "nostalgist";
import type { EmulatorSession, EmulatorSessionArgs, InputState } from "../types";

const inputToButton: Array<{ key: keyof InputState; button: string }> = [
  { key: "up", button: "up" },
  { key: "down", button: "down" },
  { key: "left", button: "left" },
  { key: "right", button: "right" },
  { key: "a", button: "a" },
  { key: "b", button: "b" },
  { key: "start", button: "start" }
];

const defaultInputState: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  a: false,
  b: false,
  start: false,
  select: false
};

export class MdEmulatorSession implements EmulatorSession {
  private readonly onError?: (err: Error) => void;
  private readonly onFps?: (fps: number) => void;

  private nostalgist: Nostalgist | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private romBytes: Uint8Array | null = null;
  private running = false;
  private inputState: InputState = { ...defaultInputState };
  private previousApplied: InputState = { ...defaultInputState };

  public constructor(args: EmulatorSessionArgs) {
    this.onError = args.onError;
    this.onFps = args.onFps;
  }

  public async mount(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    if (!canvas.width || !canvas.height) {
      canvas.width = 320;
      canvas.height = 224;
    }
  }

  public async loadRom(romBytes: Uint8Array): Promise<void> {
    this.romBytes = romBytes;
    await this.launch();
  }

  public start(): void {
    this.running = true;
    const emulator = this.nostalgist;
    if (!emulator) return;
    const status = emulator.getStatus();
    if (status === "paused") {
      emulator.resume();
      return;
    }
    if (status === "initial") {
      void emulator.start().catch((error: unknown) => this.handleError(error));
    }
  }

  public stop(): void {
    this.running = false;
    const emulator = this.nostalgist;
    if (!emulator) return;
    if (emulator.getStatus() === "running") {
      emulator.pause();
    }
  }

  public reset(): void {
    this.nostalgist?.restart();
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
      select: false
    };
    this.applyInput();
  }

  public setVolume(_v: number): void {
    // RetroArch audio path is controlled internally by Nostalgist.
  }

  public destroy(): void {
    this.stop();
    if (this.nostalgist) {
      try {
        this.nostalgist.exit({ removeCanvas: false });
      } catch {
        // noop
      }
    }
    this.nostalgist = null;
    this.canvas = null;
    this.romBytes = null;
    this.previousApplied = { ...defaultInputState };
  }

  private async launch(): Promise<void> {
    if (!this.canvas || !this.romBytes) {
      throw new Error("MD: session is not ready");
    }

    if (this.nostalgist) {
      try {
        this.nostalgist.exit({ removeCanvas: false });
      } catch {
        // noop
      }
      this.nostalgist = null;
    }

    const romCopy = new Uint8Array(this.romBytes.length);
    romCopy.set(this.romBytes);
    const romBlob = new Blob([romCopy.buffer], { type: "application/octet-stream" });
    try {
      const emulator = await Nostalgist.megadrive({
        element: this.canvas,
        rom: {
          fileName: "game.md",
          fileContent: romBlob
        },
        runEmulatorManually: true,
        respondToGlobalEvents: false
      });
      this.nostalgist = emulator;
      this.previousApplied = { ...defaultInputState };
      this.applyInput();
      this.onFps?.(60);
      if (this.running) {
        await emulator.start();
      }
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  private applyInput(): void {
    const emulator = this.nostalgist;
    if (!emulator) return;

    for (const binding of inputToButton) {
      const next = Boolean(this.inputState[binding.key]);
      const prev = Boolean(this.previousApplied[binding.key]);
      if (next === prev) continue;
      if (next) {
        emulator.pressDown({ button: binding.button, player: 1 });
      } else {
        emulator.pressUp({ button: binding.button, player: 1 });
      }
      this.previousApplied[binding.key] = next;
    }
  }

  private handleError(error: unknown): void {
    const err = error instanceof Error ? error : new Error("MD: emulator error");
    this.onError?.(err);
  }
}
