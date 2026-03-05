import type { EmulatorDefinition } from "../types";
import { GbaEmulatorSession } from "./GbaEmulatorSession";

export const gbaEmulatorDefinition: EmulatorDefinition = {
  id: "gba",
  name: "Nintendo Game Boy Advance",
  short: "GBA",
  supportedExt: [".gba"],
  isAvailable: true,
  createSession(args) {
    return new GbaEmulatorSession(args);
  }
};
