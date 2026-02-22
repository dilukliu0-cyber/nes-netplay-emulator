export type EmulatorId = "nes" | "snes";

export type InputState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean;
  b: boolean;
  start: boolean;
  select: boolean;
  x?: boolean;
  y?: boolean;
  l?: boolean;
  r?: boolean;
};

export type EmulatorSessionArgs = {
  onFps?: (fps: number) => void;
  onError?: (err: Error) => void;
};

export interface EmulatorSession {
  mount(canvas: HTMLCanvasElement): Promise<void>;
  loadRom(romBytes: Uint8Array): Promise<void>;
  start(): void;
  stop(): void;
  reset(): void;
  saveState?(): Uint8Array;
  loadState?(stateBytes: Uint8Array): void;
  setInput(p1: InputState, p2?: InputState): void;
  setVolume(v: number): void;
  destroy(): void;
}

export interface EmulatorDefinition {
  id: EmulatorId;
  name: string;
  short: string;
  supportedExt: string[];
  isAvailable: boolean;
  createSession(args: EmulatorSessionArgs): EmulatorSession;
}
