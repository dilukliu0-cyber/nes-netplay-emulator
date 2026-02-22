import type { EmulatorDefinition } from "../types";
import { SnesEmulatorSession } from "./SnesEmulatorSession";

export const snesEmulatorDefinition: EmulatorDefinition = {
  id: "snes",
  name: "Super Nintendo Entertainment System",
  short: "SNES",
  supportedExt: [".sfc", ".smc"],
  isAvailable: true,
  createSession(args) {
    return new SnesEmulatorSession(args);
  }
};
