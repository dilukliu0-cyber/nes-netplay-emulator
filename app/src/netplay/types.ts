import type { SocialClient } from "../core/socialClient";

export type NetplayConfig = {
  enabled: boolean;
  social: SocialClient;
  roomId: string;
  localUserId: string;
  hostUserId: string;
  localPlayer: 1 | 2;
  transport: "lockstep" | "stream";
  isSpectator?: boolean;
  streamPeerUserId?: string;
};

export type RoomChatMessage = {
  id: string;
  roomId: string;
  fromUserId: string;
  fromDisplayName: string;
  text: string;
  createdAt: string;
};
