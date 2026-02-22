import type { EmulatorId } from "./types";

const extToEmulator: Record<string, EmulatorId> = {
  ".nes": "nes",
  ".sfc": "snes",
  ".smc": "snes"
};

export function normalizeExt(ext: string): string {
  const trimmed = ext.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

export function detectEmulatorByExt(ext: string): EmulatorId | null {
  return extToEmulator[normalizeExt(ext)] ?? null;
}
