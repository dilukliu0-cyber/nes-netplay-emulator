import type { EmulatorDefinition } from "../types";
import { GbEmulatorSession } from "./GbEmulatorSession";

export const gbEmulatorDefinition: EmulatorDefinition = {
  id: "gb",
  name: "Nintendo Game Boy",
  short: "GB",
  supportedExt: [".gb", ".gbc"],
  isAvailable: true,
  createSession(args) {
    return new GbEmulatorSession(args);
  }
};
