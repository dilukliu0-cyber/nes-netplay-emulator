import { detectEmulatorByExt, normalizeExt } from "./detect";
import { nesEmulatorDefinition } from "./nes";
import { snesEmulatorDefinition } from "./snes";
import type { EmulatorDefinition, EmulatorId } from "./types";

const definitions: Record<EmulatorId, EmulatorDefinition> = {
  nes: nesEmulatorDefinition,
  snes: snesEmulatorDefinition
};

export function listEmulators(): EmulatorDefinition[] {
  return Object.values(definitions);
}

export function getEmulator(id: EmulatorId): EmulatorDefinition {
  return definitions[id];
}

export function assertSupported(romExt: string, emulatorId: EmulatorId): { ok: true } | { ok: false; reason: string } {
  const normalized = normalizeExt(romExt);
  const emu = getEmulator(emulatorId);
  if (!emu.isAvailable) {
    return { ok: false, reason: `${emu.short} is not available` };
  }
  if (!emu.supportedExt.includes(normalized)) {
    const autoDetected = detectEmulatorByExt(normalized);
    if (autoDetected) {
      const detected = getEmulator(autoDetected);
      return { ok: false, reason: `ROM ${normalized} is not supported by ${emu.short}. Recommended: ${detected.short}.` };
    }
    return { ok: false, reason: `Unsupported ROM extension: ${normalized || "(empty)"}` };
  }
  return { ok: true };
}
