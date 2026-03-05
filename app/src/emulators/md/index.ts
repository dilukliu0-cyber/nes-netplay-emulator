import type { EmulatorDefinition } from "../types";
import { MdEmulatorSession } from "./MdEmulatorSession";

export const mdEmulatorDefinition: EmulatorDefinition = {
  id: "md",
  name: "Sega Mega Drive / Genesis",
  short: "MD",
  supportedExt: [".md", ".gen", ".bin"],
  isAvailable: true,
  createSession(args) {
    return new MdEmulatorSession(args);
  }
};
