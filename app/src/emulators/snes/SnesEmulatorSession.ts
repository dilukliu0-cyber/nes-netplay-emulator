import snesCore from "snes9x-next";
import type { EmulatorSession, EmulatorSessionArgs, InputState } from "../types";

const PORT_1 = 0;
const PORT_2 = 1;

const snesButtonByInput: Array<{ key: keyof InputState; id: number }> = [
  { key: "b", id: snesCore.DEVICE_ID_JOYPAD_B },
  { key: "y", id: snesCore.DEVICE_ID_JOYPAD_Y },
  { key: "select", id: snesCore.DEVICE_ID_JOYPAD_SELECT },
  { key: "start", id: snesCore.DEVICE_ID_JOYPAD_START },
  { key: "up", id: snesCore.DEVICE_ID_JOYPAD_UP },
  { key: "down", id: snesCore.DEVICE_ID_JOYPAD_DOWN },
  { key: "left", id: snesCore.DEVICE_ID_JOYPAD_LEFT },
  { key: "right", id: snesCore.DEVICE_ID_JOYPAD_RIGHT },
  { key: "a", id: snesCore.DEVICE_ID_JOYPAD_A },
  { key: "x", id: snesCore.DEVICE_ID_JOYPAD_X },
  { key: "l", id: snesCore.DEVICE_ID_JOYPAD_L },
  { key: "r", id: snesCore.DEVICE_ID_JOYPAD_R }
];

const perfInterface = {
  get_time_usec: () => Math.floor(performance.now() * 1000),
  get_cpu_features: () => 0,
  get_perf_counter: () => 0,
  register: () => undefined,
  start: () => undefined,
  stop: () => undefined,
  log: () => undefined
};

export class SnesEmulatorSession implements EmulatorSession {
  private static initialized = false;
  private static active = false;

  private readonly onError?: (err: Error) => void;
  private readonly onFps?: (fps: number) => void;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private frameImage: ImageData | null = null;
  private inputStateP1: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    x: false,
    y: false,
    l: false,
    r: false,
    start: false,
    select: false
  };
  private inputStateP2: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    x: false,
    y: false,
    l: false,
    r: false,
    start: false,
    select: false
  };

  private romLoaded = false;
  private running = false;
  private rafId: number | null = null;
  private targetFps = 60;

  private audioContext: AudioContext | null = null;
  private audioNode: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private audioQueueL: number[] = [];
  private audioQueueR: number[] = [];
  private volume = 1;

  public constructor(args: EmulatorSessionArgs) {
    this.onError = args.onError;
    this.onFps = args.onFps;
    this.configureCoreCallbacks();
  }

  public async mount(canvas: HTMLCanvasElement): Promise<void> {
    if (SnesEmulatorSession.active) {
      throw new Error("SNES session is already active");
    }
    SnesEmulatorSession.active = true;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      SnesEmulatorSession.active = false;
      throw new Error("SNES: canvas context is not available");
    }

    this.canvas = canvas;
    this.ctx = ctx;

    if (!SnesEmulatorSession.initialized) {
      snesCore.init();
      SnesEmulatorSession.initialized = true;
    }

    snesCore.set_controller_port_device(PORT_1, snesCore.DEVICE_JOYPAD);
    snesCore.set_controller_port_device(PORT_2, snesCore.DEVICE_JOYPAD);
    const avInfo = snesCore.get_system_av_info();
    const width = Math.max(1, avInfo.geometry.base_width | 0);
    const height = Math.max(1, avInfo.geometry.base_height | 0);
    this.targetFps = avInfo.timing.fps > 0 ? avInfo.timing.fps : 60;

    canvas.width = width;
    canvas.height = height;
    this.frameImage = ctx.createImageData(width, height);

    this.setupAudio(avInfo.timing.sample_rate || 32040.5);
  }

  public async loadRom(romBytes: Uint8Array): Promise<void> {
    this.ensureMounted();
    const loaded = snesCore.load_game(romBytes);
    if (!loaded) {
      throw new Error("SNES: failed to load ROM data");
    }
    this.romLoaded = true;
  }

  public start(): void {
    if (!this.romLoaded || this.running) return;
    this.running = true;
    if (this.audioContext && this.audioContext.state === "suspended") {
      void this.audioContext.resume().catch(() => undefined);
    }

    let frames = 0;
    let fpsWindowStart = performance.now();
    let nextFrameAt = performance.now();

    const step = () => {
      if (!this.running) return;
      const now = performance.now();
      if (now >= nextFrameAt) {
        snesCore.run();
        nextFrameAt = now + 1000 / this.targetFps;
        frames += 1;
        if (now - fpsWindowStart >= 1000) {
          this.onFps?.(frames);
          fpsWindowStart = now;
          frames = 0;
        }
      }
      this.rafId = window.requestAnimationFrame(step);
    };

    this.rafId = window.requestAnimationFrame(step);
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public reset(): void {
    if (!this.romLoaded) return;
    snesCore.reset();
  }

  public saveState(): Uint8Array {
    if (!this.romLoaded) {
      throw new Error("SNES: no ROM is loaded");
    }
    const size = snesCore.serialize_size();
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error("SNES: failed to determine state size");
    }
    const state = new Uint8Array(size);
    const ok = snesCore.serialize(state);
    if (!ok) {
      throw new Error("SNES: failed to save state");
    }
    return state;
  }

  public loadState(stateBytes: Uint8Array): void {
    if (!this.romLoaded) {
      throw new Error("SNES: no ROM is loaded");
    }
    const ok = snesCore.unserialize(stateBytes);
    if (!ok) {
      throw new Error("SNES: failed to load state");
    }
  }

  public setInput(p1: InputState, p2?: InputState): void {
    this.inputStateP1 = {
      up: Boolean(p1.up),
      down: Boolean(p1.down),
      left: Boolean(p1.left),
      right: Boolean(p1.right),
      a: Boolean(p1.a),
      b: Boolean(p1.b),
      start: Boolean(p1.start),
      select: Boolean(p1.select),
      x: Boolean(p1.x),
      y: Boolean(p1.y),
      l: Boolean(p1.l),
      r: Boolean(p1.r)
    };
    if (p2) {
      this.inputStateP2 = {
        up: Boolean(p2.up),
        down: Boolean(p2.down),
        left: Boolean(p2.left),
        right: Boolean(p2.right),
        a: Boolean(p2.a),
        b: Boolean(p2.b),
        start: Boolean(p2.start),
        select: Boolean(p2.select),
        x: Boolean(p2.x),
        y: Boolean(p2.y),
        l: Boolean(p2.l),
        r: Boolean(p2.r)
      };
    }
  }

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  public destroy(): void {
    this.stop();
    if (this.romLoaded) {
      snesCore.unload_game();
      this.romLoaded = false;
    }
    if (SnesEmulatorSession.initialized) {
      snesCore.deinit();
      SnesEmulatorSession.initialized = false;
    }
    this.audioNode?.disconnect();
    this.gainNode?.disconnect();
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
    }
    this.audioNode = null;
    this.gainNode = null;
    this.audioContext = null;
    this.audioQueueL = [];
    this.audioQueueR = [];
    this.canvas = null;
    this.ctx = null;
    this.frameImage = null;
    SnesEmulatorSession.active = false;
  }

  private configureCoreCallbacks(): void {
    snesCore.set_environment((cmd) => {
      if (cmd === snesCore.ENVIRONMENT_GET_LOG_INTERFACE) {
        return (_level: number, ...args: string[]) => {
          if (args.length > 0) {
            console.info("[SNES core]", args.join(" ").trim());
          }
        };
      }
      if (cmd === snesCore.ENVIRONMENT_GET_PERF_INTERFACE) {
        return perfInterface;
      }
      if (cmd === snesCore.ENVIRONMENT_SET_PIXEL_FORMAT) {
        return snesCore.PIXEL_FORMAT_RGB565;
      }
      if (cmd === snesCore.ENVIRONMENT_GET_CAN_DUPE || cmd === snesCore.ENVIRONMENT_GET_VARIABLE_UPDATE) {
        return 1;
      }
      if (cmd === snesCore.ENVIRONMENT_GET_LANGUAGE) {
        return snesCore.LANGUAGE_ENGLISH;
      }
      if (
        cmd === snesCore.ENVIRONMENT_GET_SYSTEM_DIRECTORY ||
        cmd === snesCore.ENVIRONMENT_GET_LIBRETRO_PATH ||
        cmd === snesCore.ENVIRONMENT_GET_CORE_ASSETS_DIRECTORY ||
        cmd === snesCore.ENVIRONMENT_GET_SAVE_DIRECTORY ||
        cmd === snesCore.ENVIRONMENT_GET_USERNAME
      ) {
        return ".";
      }
      if (cmd === snesCore.ENVIRONMENT_GET_VARIABLE) {
        return "";
      }
      return true;
    });

    snesCore.set_input_poll(() => undefined);
    snesCore.set_input_state((port, _device, _index, id) => {
      if (port !== PORT_1 && port !== PORT_2) {
        return 0;
      }
      const mapping = snesButtonByInput.find((item) => item.id === id);
      if (!mapping) {
        return 0;
      }
      const source = port === PORT_1 ? this.inputStateP1 : this.inputStateP2;
      return source[mapping.key] ? 1 : 0;
    });

    snesCore.set_video_refresh((data, width, height, pitch) => {
      const frame = this.frameImage;
      const ctx = this.ctx;
      if (!frame || !ctx) {
        return;
      }
      const rowPixels = Math.max(1, (pitch >> 1) || width);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const src = y * rowPixels + x;
          const pixel = data[src] ?? 0;
          const r5 = (pixel >> 11) & 0x1f;
          const g6 = (pixel >> 5) & 0x3f;
          const b5 = pixel & 0x1f;
          const dst = (y * width + x) * 4;
          frame.data[dst] = (r5 << 3) | (r5 >> 2);
          frame.data[dst + 1] = (g6 << 2) | (g6 >> 4);
          frame.data[dst + 2] = (b5 << 3) | (b5 >> 2);
          frame.data[dst + 3] = 255;
        }
      }
      ctx.imageSmoothingEnabled = false;
      ctx.putImageData(frame, 0, 0);
    });

    snesCore.set_audio_sample((_left, _right) => undefined);
    snesCore.set_audio_sample_batch((left, right, frames) => {
      for (let i = 0; i < frames; i += 1) {
        this.audioQueueL.push(left[i]);
        this.audioQueueR.push(right[i]);
      }
      return frames;
    });

  }

  private setupAudio(sampleRate: number): void {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    try {
      this.audioContext = new AudioContextCtor({ sampleRate: Math.max(8000, Math.min(96000, sampleRate)) });
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.volume;
      this.audioNode = this.audioContext.createScriptProcessor(1024, 0, 2);
      this.audioNode.onaudioprocess = (event) => {
        const outL = event.outputBuffer.getChannelData(0);
        const outR = event.outputBuffer.getChannelData(1);
        for (let i = 0; i < outL.length; i += 1) {
          outL[i] = this.audioQueueL.length > 0 ? (this.audioQueueL.shift() as number) : 0;
          outR[i] = this.audioQueueR.length > 0 ? (this.audioQueueR.shift() as number) : 0;
        }
      };
      this.audioNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("SNES: failed to initialize audio");
      this.onError?.(err);
    }
  }

  private ensureMounted(): void {
    if (!this.canvas || !this.ctx) {
      throw new Error("SNES: session is not mounted");
    }
  }
}
