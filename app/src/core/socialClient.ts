import type { FriendItem, InvitePayload, Profile, RoomState } from "../types/global";

type Handler<T> = (payload: T) => void;

interface WsResponse {
  type: "response";
  requestId: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

interface WsEvent {
  type: "event";
  event: string;
  payload: unknown;
}

interface NetplayStartPayload {
  roomId: string;
  gameId: string;
  gameName?: string;
  platform?: string;
  emulatorId?: string;
  romHash?: string;
  protocolVersion?: string;
  coreVersion?: string;
  romBase64: string;
  hostUserId: string;
}

interface NetplayInputPayload {
  roomId: string;
  fromUserId: string;
  frame: number;
  state: number;
}

interface StreamStartPayload {
  roomId: string;
  gameId: string;
  gameName?: string;
  platform?: string;
  hostUserId: string;
}

interface StreamSignalPayload {
  roomId: string;
  fromUserId: string;
  signal: unknown;
}

interface StreamInputPayload {
  roomId: string;
  fromUserId: string;
  state: number;
}

interface RoomPausePayload {
  roomId: string;
  fromUserId: string;
  paused: boolean;
}

interface RoomClosedPayload {
  roomId: string;
}

interface RoomKickedPayload {
  roomId: string;
  byUserId: string;
}

interface RoomChatPayload {
  id: string;
  roomId: string;
  fromUserId: string;
  fromDisplayName: string;
  text: string;
  createdAt: string;
}

export class SocialClient {
  private ws: WebSocket | null = null;
  private profile: Profile;
  private getUrl?: () => string;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private friendsHandler: Handler<FriendItem[]> | null = null;
  private inviteHandler: Handler<InvitePayload> | null = null;
  private presenceHandler: Handler<{ userId: string; online: boolean; roomId?: string; inGame?: boolean; gameId?: string; gameName?: string; avatarDataUrl?: string }> | null = null;
  private netplayStartHandler: Handler<NetplayStartPayload> | null = null;
  private netplayInputHandler: Handler<NetplayInputPayload> | null = null;
  private streamStartHandler: Handler<StreamStartPayload> | null = null;
  private streamSignalHandler: Handler<StreamSignalPayload> | null = null;
  private streamInputHandler: Handler<StreamInputPayload> | null = null;
  private roomPauseHandler: Handler<RoomPausePayload> | null = null;
  private roomUpdateHandler: Handler<RoomState> | null = null;
  private roomClosedHandler: Handler<RoomClosedPayload> | null = null;
  private roomKickedHandler: Handler<RoomKickedPayload> | null = null;
  private roomChatHandler: Handler<RoomChatPayload> | null = null;

  constructor(profile: Profile, getUrl?: () => string) {
    this.profile = profile;
    this.getUrl = getUrl;
  }

  private rejectAllPending(error: Error): void {
    for (const [requestId, entry] of this.pending.entries()) {
      this.pending.delete(requestId);
      entry.reject(error);
    }
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      // noop
    }
    this.rejectAllPending(new Error("Connection closed"));
    this.ws = null;
  }

  updateProfile(profile: Profile): void {
    this.profile = profile;
    this.close();
  }

  onFriends(handler: Handler<FriendItem[]>): void {
    this.friendsHandler = handler;
  }

  onInvite(handler: Handler<InvitePayload>): void {
    this.inviteHandler = handler;
  }

  onPresence(handler: Handler<{ userId: string; online: boolean; roomId?: string; inGame?: boolean; gameId?: string; gameName?: string; avatarDataUrl?: string }>): void {
    this.presenceHandler = handler;
  }

  onNetplayStart(handler: Handler<NetplayStartPayload>): void {
    this.netplayStartHandler = handler;
  }

  onNetplayInput(handler: Handler<NetplayInputPayload>): void {
    this.netplayInputHandler = handler;
  }

  onStreamStart(handler: Handler<StreamStartPayload>): void {
    this.streamStartHandler = handler;
  }

  onStreamSignal(handler: Handler<StreamSignalPayload>): void {
    this.streamSignalHandler = handler;
  }

  onStreamInput(handler: Handler<StreamInputPayload>): void {
    this.streamInputHandler = handler;
  }

  onRoomPause(handler: Handler<RoomPausePayload>): void {
    this.roomPauseHandler = handler;
  }

  onRoomUpdate(handler: Handler<RoomState>): void {
    this.roomUpdateHandler = handler;
  }

  onRoomClosed(handler: Handler<RoomClosedPayload>): void {
    this.roomClosedHandler = handler;
  }

  onRoomKicked(handler: Handler<RoomKickedPayload>): void {
    this.roomKickedHandler = handler;
  }

  onRoomChat(handler: Handler<RoomChatPayload>): void {
    this.roomChatHandler = handler;
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    const url = this.getUrl?.() || (import.meta.env.VITE_SIGNALING_URL as string | undefined) || "ws://localhost:8787";

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;

      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          ws.close();
        } catch {
          // noop
        }
        this.ws = null;
        reject(error);
      };

      ws.onopen = () => {
        const requestId = crypto.randomUUID();
        const timeoutId = setTimeout(() => {
          const pending = this.pending.get(requestId);
          if (pending) {
            this.pending.delete(requestId);
            fail(new Error("Server did not confirm auth"));
          }
        }, 10000);

        this.pending.set(requestId, {
          resolve: () => {
            clearTimeout(timeoutId);
            if (!settled) {
              settled = true;
              resolve();
            }
          },
          reject: (error) => {
            clearTimeout(timeoutId);
            fail(error);
          }
        });

        this.send("auth", {
          userId: this.profile.userId,
          displayName: this.profile.displayName,
          friendCode: this.profile.friendCode,
          avatarDataUrl: this.profile.avatarDataUrl
        }, requestId);
      };

      ws.onerror = () => fail(new Error("Failed to connect to signaling server"));
      ws.onclose = () => {
        this.rejectAllPending(new Error("Signaling connection closed"));
        this.ws = null;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as WsResponse | WsEvent;
          if (data.type === "response") {
            const entry = this.pending.get(data.requestId);
            if (entry) {
              this.pending.delete(data.requestId);
              if (data.ok) {
                entry.resolve(data.payload);
              } else {
                entry.reject(new Error(data.error || "Request failed"));
              }
            }
            return;
          }

          if (data.type === "event") {
            if (data.event === "friends:list" && this.friendsHandler) {
              this.friendsHandler(data.payload as FriendItem[]);
            }
            if (data.event === "invite:received" && this.inviteHandler) {
              this.inviteHandler(data.payload as InvitePayload);
            }
            if (data.event === "presence:update" && this.presenceHandler) {
              this.presenceHandler(data.payload as { userId: string; online: boolean; roomId?: string; inGame?: boolean; gameId?: string; gameName?: string; avatarDataUrl?: string });
            }
            if (data.event === "netplay:start" && this.netplayStartHandler) {
              this.netplayStartHandler(data.payload as NetplayStartPayload);
            }
            if (data.event === "netplay:input" && this.netplayInputHandler) {
              this.netplayInputHandler(data.payload as NetplayInputPayload);
            }
            if (data.event === "stream:start" && this.streamStartHandler) {
              this.streamStartHandler(data.payload as StreamStartPayload);
            }
            if (data.event === "stream:signal" && this.streamSignalHandler) {
              this.streamSignalHandler(data.payload as StreamSignalPayload);
            }
            if (data.event === "stream:input" && this.streamInputHandler) {
              this.streamInputHandler(data.payload as StreamInputPayload);
            }
            if (data.event === "room:pause" && this.roomPauseHandler) {
              this.roomPauseHandler(data.payload as RoomPausePayload);
            }
            if (data.event === "room:update" && this.roomUpdateHandler) {
              this.roomUpdateHandler(data.payload as RoomState);
            }
            if (data.event === "room:closed" && this.roomClosedHandler) {
              this.roomClosedHandler(data.payload as RoomClosedPayload);
            }
            if (data.event === "room:kicked" && this.roomKickedHandler) {
              this.roomKickedHandler(data.payload as RoomKickedPayload);
            }
            if (data.event === "room:chat" && this.roomChatHandler) {
              this.roomChatHandler(data.payload as RoomChatPayload);
            }
          }
        } catch {
          // ignore malformed messages in MVP
        }
      };
    });
  }

  async request<T = unknown>(type: string, payload?: Record<string, unknown>): Promise<T> {
    await this.connect();

    const requestId = crypto.randomUUID();
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      setTimeout(() => {
        const pending = this.pending.get(requestId);
        if (pending) {
          this.pending.delete(requestId);
          pending.reject(new Error("Signaling timeout"));
        }
      }, 10000);
    });

    this.send(type, payload || {}, requestId);
    return (await promise) as T;
  }

  async refreshFriends(): Promise<FriendItem[]> {
    return this.request<FriendItem[]>("friends:list");
  }

  async addFriend(friendCode: string): Promise<FriendItem[]> {
    return this.request<FriendItem[]>("friends:add", { friendCode });
  }

  async sendInvite(friendUserId: string, roomId: string, gameId: string): Promise<boolean> {
    await this.request("invite:send", { friendUserId, roomId, gameId });
    return true;
  }

  async respondInvite(inviteId: string, accept: boolean): Promise<{ roomId?: string }> {
    return this.request<{ roomId?: string }>("invite:respond", { inviteId, accept });
  }

  async startNetplay(
    roomId: string,
    gameId: string,
    gameName: string,
    platform: string,
    romBase64: string,
    emulatorId: string,
    romHash: string
  ): Promise<boolean> {
    await this.request("netplay:start", {
      roomId,
      gameId,
      gameName,
      platform,
      romBase64,
      emulatorId,
      romHash,
      protocolVersion: "1",
      coreVersion: emulatorId === "snes" ? "snes9x-next" : "jsnes"
    });
    return true;
  }

  async startStream(roomId: string, gameId: string, gameName: string, platform: string): Promise<boolean> {
    await this.request("stream:start", { roomId, gameId, gameName, platform });
    return true;
  }

  sendNetplayInput(roomId: string, frame: number, state: number): void {
    this.send("netplay:input", { roomId, frame, state });
  }

  sendStreamSignal(roomId: string, targetUserId: string, signal: unknown): void {
    this.send("stream:signal", { roomId, targetUserId, signal });
  }

  sendStreamInput(roomId: string, state: number): void {
    this.send("stream:input", { roomId, state });
  }

  sendRoomPause(roomId: string, paused: boolean): void {
    this.send("room:pause", { roomId, paused });
  }

  async getRoomState(roomId: string): Promise<RoomState> {
    return this.request<RoomState>("room:state", { roomId });
  }

  async getRoomChatHistory(roomId: string): Promise<RoomChatPayload[]> {
    return this.request<RoomChatPayload[]>("room:chat:history", { roomId });
  }

  async sendRoomChat(roomId: string, text: string): Promise<boolean> {
    await this.request("room:chat:send", { roomId, text });
    return true;
  }

  private send(type: string, payload: Record<string, unknown>, requestId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify({ type, requestId, payload }));
  }
}
