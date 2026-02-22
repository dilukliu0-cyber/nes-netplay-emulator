declare module "snes9x-next" {
  export interface RetroSystemInfo {
    library_name: string;
    library_version: string;
    valid_extensions: string;
    need_fullpath: boolean;
    block_extract: boolean;
  }

  export interface RetroSystemAvInfo {
    geometry: {
      base_width: number;
      base_height: number;
      max_width: number;
      max_height: number;
      aspect_ratio: number;
    };
    timing: {
      fps: number;
      sample_rate: number;
    };
  }

  export interface RetroPerfInterface {
    get_time_usec: () => number;
    get_cpu_features: () => number;
    get_perf_counter: () => number;
    register: () => void;
    start: () => void;
    stop: () => void;
    log: () => void;
  }

  export interface Snes9xCore {
    ENVIRONMENT_GET_LOG_INTERFACE: number;
    ENVIRONMENT_GET_PERF_INTERFACE: number;
    ENVIRONMENT_GET_CAN_DUPE: number;
    ENVIRONMENT_GET_VARIABLE_UPDATE: number;
    ENVIRONMENT_GET_LANGUAGE: number;
    ENVIRONMENT_GET_SYSTEM_DIRECTORY: number;
    ENVIRONMENT_GET_LIBRETRO_PATH: number;
    ENVIRONMENT_GET_CORE_ASSETS_DIRECTORY: number;
    ENVIRONMENT_GET_SAVE_DIRECTORY: number;
    ENVIRONMENT_GET_USERNAME: number;
    ENVIRONMENT_GET_VARIABLE: number;
    ENVIRONMENT_SET_PIXEL_FORMAT: number;
    PIXEL_FORMAT_RGB565: number;

    DEVICE_JOYPAD: number;
    DEVICE_ID_JOYPAD_B: number;
    DEVICE_ID_JOYPAD_Y: number;
    DEVICE_ID_JOYPAD_SELECT: number;
    DEVICE_ID_JOYPAD_START: number;
    DEVICE_ID_JOYPAD_UP: number;
    DEVICE_ID_JOYPAD_DOWN: number;
    DEVICE_ID_JOYPAD_LEFT: number;
    DEVICE_ID_JOYPAD_RIGHT: number;
    DEVICE_ID_JOYPAD_A: number;
    DEVICE_ID_JOYPAD_X: number;
    DEVICE_ID_JOYPAD_L: number;
    DEVICE_ID_JOYPAD_R: number;

    LANGUAGE_ENGLISH: number;

    set_environment(fn: (cmd: number, data?: unknown, extra?: unknown) => unknown): void;
    set_video_refresh(fn: (data: Uint16Array, width: number, height: number, pitch: number) => void): void;
    set_audio_sample_batch(fn: (left: Float32Array, right: Float32Array, frames: number) => number): void;
    set_audio_sample(fn: (left: number, right: number) => void): void;
    set_input_poll(fn: () => void): void;
    set_input_state(fn: (port: number, device: number, index: number, id: number) => number): void;
    set_controller_port_device(port: number, device: number): void;

    init(): void;
    deinit(): void;
    run(): void;
    reset(): void;
    load_game(data: Uint8Array): boolean;
    unload_game(): void;
    serialize_size(): number;
    serialize(data: Uint8Array): boolean;
    unserialize(data: Uint8Array): boolean;

    get_system_info(): RetroSystemInfo;
    get_system_av_info(): RetroSystemAvInfo;
  }

  const core: Snes9xCore;
  export = core;
}
