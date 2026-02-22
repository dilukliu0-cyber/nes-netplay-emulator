import type { EmulatorDefinition } from "../types";
import { NesEmulatorSession } from "./NesEmulatorSession";

export const nesEmulatorDefinition: EmulatorDefinition = {
  id: "nes",
  name: "Nintendo Entertainment System",
  short: "NES",
  supportedExt: [".nes"],
  isAvailable: true,
  createSession(args) {
    return new NesEmulatorSession(args);
  }
};
