export type Json = Record<string, unknown>;

export interface UserRecord {
  userId: string;
  displayName: string;
  friendCode: string;
  friends: string[];
  avatarDataUrl?: string;
}

export interface InviteRecord {
  inviteId: string;
  fromUserId: string;
  toUserId: string;
  roomId: string;
  gameId: string;
  createdAt: string;
}

export interface RoomRecord {
  roomId: string;
  hostUserId: string;
  gameId: string;
  members: string[];
  spectators: string[];
  locked: boolean;
  readyByUserId: string[];
  chat: Array<{
    id: string;
    roomId: string;
    fromUserId: string;
    text: string;
    createdAt: string;
  }>;
  session?: {
    mode: "lockstep" | "stream";
    gameId: string;
    gameName: string;
    platform: string;
    emulatorId?: string;
    romHash?: string;
    protocolVersion?: string;
    coreVersion?: string;
    romBase64?: string;
    startedAt: string;
  };
}

export interface IncomingMessage {
  type: string;
  requestId?: string;
  payload?: Json;
}
