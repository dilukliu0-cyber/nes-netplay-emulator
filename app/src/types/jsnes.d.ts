declare module "jsnes" {
  export class NES {
    constructor(options?: {
      onFrame?: (frameBuffer: number[]) => void;
      onAudioSample?: (left: number, right: number) => void;
    });
    frame(): void;
    loadROM(data: string): void;
    buttonDown(player: number, button: number): void;
    buttonUp(player: number, button: number): void;
  }

  export const Controller: {
    BUTTON_A: number;
    BUTTON_B: number;
    BUTTON_SELECT: number;
    BUTTON_START: number;
    BUTTON_UP: number;
    BUTTON_DOWN: number;
    BUTTON_LEFT: number;
    BUTTON_RIGHT: number;
  };
}
