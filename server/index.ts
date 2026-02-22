import * as fs from "fs";
import * as path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";

type Json = Record<string, unknown>;

interface UserRecord {
  userId: string;
  displayName: string;
  friendCode: string;
  friends: string[];
  avatarDataUrl?: string;
}

interface InviteRecord {
  inviteId: string;
  fromUserId: string;
  toUserId: string;
  roomId: string;
  gameId: string;
  createdAt: string;
}

interface RoomRecord {
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

interface IncomingMessage {
  type: string;
  requestId?: string;
  payload?: Json;
}

const PORT = Number(process.env.SIGNALING_PORT || 8787);
const dataDir = path.join(__dirname, "data");
const usersFile = path.join(dataDir, "users.json");

function ensureUsersFile(): void {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, "[]", "utf-8");
  }
}

function loadUsers(): UserRecord[] {
  ensureUsersFile();
  try {
    return JSON.parse(fs.readFileSync(usersFile, "utf-8")) as UserRecord[];
  } catch {
    return [];
  }
}

function saveUsers(users: UserRecord[]): void {
  ensureUsersFile();
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), "utf-8");
}

const users = loadUsers();
const socketsByUserId = new Map<string, Set<WebSocket>>();
const socketUser = new Map<WebSocket, string>();
const rooms = new Map<string, RoomRecord>();
const invites = new Map<string, InviteRecord>();

function getUserById(userId: string): UserRecord | undefined {
  return users.find((u) => u.userId === userId);
}

function getUserByCode(friendCode: string): UserRecord | undefined {
  return users.find((u) => u.friendCode.toUpperCase() === friendCode.toUpperCase());
}

function areFriends(userId: string, otherUserId: string): boolean {
  const user = getUserById(userId);
  return Boolean(user && user.friends.includes(otherUserId));
}

function isOnline(userId: string): boolean {
  return (socketsByUserId.get(userId)?.size || 0) > 0;
}

function setSocketUser(ws: WebSocket, userId: string): void {
  socketUser.set(ws, userId);
  const set = socketsByUserId.get(userId) || new Set<WebSocket>();
  set.add(ws);
  socketsByUserId.set(userId, set);
}

function dropSocketUser(ws: WebSocket): void {
  const userId = socketUser.get(ws);
  if (!userId) {
    return;
  }
  socketUser.delete(ws);
  const set = socketsByUserId.get(userId);
  if (!set) {
    return;
  }
  set.delete(ws);
  if (set.size === 0) {
    socketsByUserId.delete(userId);
  }
}

function send(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendResponse(ws: WebSocket, requestId: string | undefined, ok: boolean, payload?: unknown, error?: string): void {
  send(ws, { type: "response", requestId, ok, payload, error });
}

function sendEventToUser(userId: string, event: string, payload: unknown): void {
  const set = socketsByUserId.get(userId);
  if (!set) {
    return;
  }
  for (const ws of set) {
    send(ws, { type: "event", event, payload });
  }
}

function sendEventToRoom(room: RoomRecord, event: string, payload: unknown, excludeUserId?: string): void {
  for (const memberId of room.members) {
    if (excludeUserId && memberId === excludeUserId) {
      continue;
    }
    sendEventToUser(memberId, event, payload);
  }
}

function findRoomByUser(userId: string): RoomRecord | undefined {
  for (const room of rooms.values()) {
    if (room.members.includes(userId)) {
      return room;
    }
  }
  return undefined;
}

function roomStatePayload(room: RoomRecord): {
  roomId: string;
  gameId: string;
  hostUserId: string;
  members: string[];
  spectators: string[];
  locked: boolean;
  readyByUserId: string[];
} {
  return {
    roomId: room.roomId,
    gameId: room.gameId,
    hostUserId: room.hostUserId,
    members: [...room.members],
    spectators: [...room.spectators],
    locked: room.locked,
    readyByUserId: [...room.readyByUserId]
  };
}

function emitRoomUpdate(room: RoomRecord): void {
  sendEventToRoom(room, "room:update", roomStatePayload(room));
  for (const memberId of room.members) {
    broadcastPresence(memberId);
  }
}

function removeUserFromRooms(userId: string): void {
  for (const room of rooms.values()) {
    if (!room.members.includes(userId)) {
      continue;
    }

    room.members = room.members.filter((id) => id !== userId);
    room.spectators = room.spectators.filter((id) => id !== userId);
    room.readyByUserId = room.readyByUserId.filter((id) => room.members.includes(id));

    if (room.members.length === 0) {
      rooms.delete(room.roomId);
      continue;
    }

    if (room.hostUserId === userId) {
      room.hostUserId = room.members[0];
    }

    emitRoomUpdate(room);
  }
}

function friendsPayload(userId: string): Array<{ userId: string; displayName: string; friendCode: string; online: boolean; avatarDataUrl?: string; roomId?: string; inGame?: boolean; gameId?: string; gameName?: string }> {
  const user = getUserById(userId);
  if (!user) {
    return [];
  }

  return user.friends
    .map((friendId) => getUserById(friendId))
    .filter((u): u is UserRecord => Boolean(u))
    .map((friend) => ({
      ...(() => {
        const room = findRoomByUser(friend.userId);
        return room
          ? {
              roomId: room.roomId,
              inGame: Boolean(room.session),
              gameId: room.session?.gameId,
              gameName: room.session?.gameName
            }
          : {};
      })(),
      userId: friend.userId,
      displayName: friend.displayName,
      friendCode: friend.friendCode,
      avatarDataUrl: friend.avatarDataUrl,
      online: isOnline(friend.userId)
    }));
}

function broadcastPresence(userId: string): void {
  const user = getUserById(userId);
  if (!user) {
    return;
  }
  for (const friendId of user.friends) {
    const room = findRoomByUser(userId);
    sendEventToUser(friendId, "presence:update", {
      userId,
      online: isOnline(userId),
      roomId: room?.roomId,
      inGame: Boolean(room?.session),
      gameId: room?.session?.gameId,
      gameName: room?.session?.gameName,
      avatarDataUrl: user.avatarDataUrl
    });
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(String(raw)) as IncomingMessage;
    } catch {
      sendResponse(ws, undefined, false, undefined, "Malformed JSON");
      return;
    }

    const payload = msg.payload || {};

    if (msg.type === "auth") {
      const userId = String(payload.userId || "").trim();
      const displayName = String(payload.displayName || "").trim();
      const friendCode = String(payload.friendCode || "").trim().toUpperCase();
      const avatarDataUrl = String(payload.avatarDataUrl || "").trim();
      if (!userId || !displayName || !friendCode) {
        sendResponse(ws, msg.requestId, false, undefined, "Invalid auth payload");
        return;
      }

      const existing = getUserById(userId);
      if (existing) {
        existing.displayName = displayName;
        existing.friendCode = friendCode;
        existing.avatarDataUrl = avatarDataUrl.startsWith("data:image/") ? avatarDataUrl : undefined;
      } else {
        users.push({
          userId,
          displayName,
          friendCode,
          friends: [],
          avatarDataUrl: avatarDataUrl.startsWith("data:image/") ? avatarDataUrl : undefined
        });
      }
      saveUsers(users);
      setSocketUser(ws, userId);
      sendResponse(ws, msg.requestId, true, { userId });
      sendEventToUser(userId, "friends:list", friendsPayload(userId));
      broadcastPresence(userId);
      return;
    }

    const actorId = socketUser.get(ws);
    if (!actorId) {
      sendResponse(ws, msg.requestId, false, undefined, "Not authenticated");
      return;
    }

    if (msg.type === "friends:list") {
      const list = friendsPayload(actorId);
      sendResponse(ws, msg.requestId, true, list);
      sendEventToUser(actorId, "friends:list", list);
      return;
    }

    if (msg.type === "friends:add") {
      const actor = getUserById(actorId);
      const code = String(payload.friendCode || "").trim();
      const friend = getUserByCode(code);

      if (!actor || !friend) {
        sendResponse(ws, msg.requestId, false, undefined, "Friend code not found");
        return;
      }
      if (friend.userId === actor.userId) {
        sendResponse(ws, msg.requestId, false, undefined, "Cannot add yourself");
        return;
      }

      if (!actor.friends.includes(friend.userId)) {
        actor.friends.push(friend.userId);
      }
      if (!friend.friends.includes(actor.userId)) {
        friend.friends.push(actor.userId);
      }
      saveUsers(users);

      const actorList = friendsPayload(actor.userId);
      const friendList = friendsPayload(friend.userId);

      sendResponse(ws, msg.requestId, true, actorList);
      sendEventToUser(actor.userId, "friends:list", actorList);
      sendEventToUser(friend.userId, "friends:list", friendList);
      return;
    }

    if (msg.type === "room:create") {
      const gameId = String(payload.gameId || "").trim();
      if (!gameId) {
        sendResponse(ws, msg.requestId, false, undefined, "gameId is required");
        return;
      }

      const roomId = uuidv4().slice(0, 8).toUpperCase();
      const room: RoomRecord = {
        roomId,
        hostUserId: actorId,
        gameId,
        members: [actorId],
        spectators: [],
        locked: false,
        readyByUserId: [],
        chat: []
      };
      rooms.set(roomId, room);
      sendResponse(ws, msg.requestId, true, roomStatePayload(room));
      return;
    }

    if (msg.type === "room:join") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const joinAsSpectator = Boolean(payload.spectator);
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (room.locked && !room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Room is locked");
        return;
      }
      if (room.session?.mode === "stream" && !room.members.includes(actorId) && !joinAsSpectator) {
        sendResponse(ws, msg.requestId, false, undefined, "Streaming room is full");
        return;
      }

      if (!room.members.includes(actorId)) {
        room.members.push(actorId);
      }
      if (joinAsSpectator) {
        if (!room.spectators.includes(actorId)) {
          room.spectators.push(actorId);
        }
      } else {
        room.spectators = room.spectators.filter((id) => id !== actorId);
      }
      sendResponse(ws, msg.requestId, true, roomStatePayload(room));
      emitRoomUpdate(room);
      if (room.session) {
        if (room.session.mode === "lockstep" && room.session.romBase64) {
          sendEventToUser(actorId, "netplay:start", {
            roomId: room.roomId,
            gameId: room.session.gameId,
            gameName: room.session.gameName,
            platform: room.session.platform,
            emulatorId: room.session.emulatorId,
            romHash: room.session.romHash,
            protocolVersion: room.session.protocolVersion,
            coreVersion: room.session.coreVersion,
            romBase64: room.session.romBase64,
            hostUserId: room.hostUserId
          });
        }
        if (room.session.mode === "stream") {
          sendEventToUser(actorId, "stream:start", {
            roomId: room.roomId,
            gameId: room.session.gameId,
            gameName: room.session.gameName,
            platform: room.session.platform,
            hostUserId: room.hostUserId
          });
        }
      }
      return;
    }

    if (msg.type === "room:state") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Not a room member");
        return;
      }
      sendResponse(ws, msg.requestId, true, roomStatePayload(room));
      return;
    }

    if (msg.type === "room:chat:history") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Not a room member");
        return;
      }
      sendResponse(ws, msg.requestId, true, room.chat.slice(-100));
      return;
    }

    if (msg.type === "room:chat:send") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const text = String(payload.text || "").trim();
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Not a room member");
        return;
      }
      if (!text) {
        sendResponse(ws, msg.requestId, false, undefined, "Message is empty");
        return;
      }

      const fromUser = getUserById(actorId);
      const message = {
        id: uuidv4(),
        roomId: room.roomId,
        fromUserId: actorId,
        fromDisplayName: fromUser?.displayName || "Player",
        text: text.slice(0, 400),
        createdAt: new Date().toISOString()
      };
      room.chat.push(message);
      if (room.chat.length > 200) {
        room.chat = room.chat.slice(-200);
      }
      sendEventToRoom(room, "room:chat", message);
      sendResponse(ws, msg.requestId, true, { delivered: true });
      return;
    }

    if (msg.type === "room:ready") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const ready = Boolean(payload.ready);
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Not a room member");
        return;
      }
      if (room.spectators.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Spectator cannot toggle ready");
        return;
      }

      room.readyByUserId = room.readyByUserId.filter((id) => room.members.includes(id));
      if (ready) {
        if (!room.readyByUserId.includes(actorId)) {
          room.readyByUserId.push(actorId);
        }
      } else {
        room.readyByUserId = room.readyByUserId.filter((id) => id !== actorId);
      }
      emitRoomUpdate(room);
      sendResponse(ws, msg.requestId, true, roomStatePayload(room));
      return;
    }

    if (msg.type === "room:lock") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const locked = Boolean(payload.locked);
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (room.hostUserId !== actorId) {
        sendResponse(ws, msg.requestId, false, undefined, "Only host can change lock");
        return;
      }

      room.locked = locked;
      emitRoomUpdate(room);
      sendResponse(ws, msg.requestId, true, roomStatePayload(room));
      return;
    }

    if (msg.type === "room:kick") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const targetUserId = String(payload.targetUserId || "").trim();
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (room.hostUserId !== actorId) {
        sendResponse(ws, msg.requestId, false, undefined, "Only host can kick");
        return;
      }
      if (!targetUserId || targetUserId === actorId) {
        sendResponse(ws, msg.requestId, false, undefined, "Invalid target user");
        return;
      }
      if (!room.members.includes(targetUserId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Target user is not in room");
        return;
      }

      room.members = room.members.filter((id) => id !== targetUserId);
      room.spectators = room.spectators.filter((id) => id !== targetUserId);
      room.readyByUserId = room.readyByUserId.filter((id) => id !== targetUserId && room.members.includes(id));
      sendEventToUser(targetUserId, "room:kicked", { roomId: room.roomId, byUserId: actorId });
      emitRoomUpdate(room);
      sendResponse(ws, msg.requestId, true, roomStatePayload(room));
      return;
    }

    if (msg.type === "room:transferHost") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const targetUserId = String(payload.targetUserId || "").trim();
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (room.hostUserId !== actorId) {
        sendResponse(ws, msg.requestId, false, undefined, "Only host can transfer host");
        return;
      }
      if (!targetUserId || !room.members.includes(targetUserId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Target user is not in room");
        return;
      }
      if (targetUserId === actorId) {
        sendResponse(ws, msg.requestId, true, roomStatePayload(room));
        return;
      }

      room.hostUserId = targetUserId;
      emitRoomUpdate(room);
      sendResponse(ws, msg.requestId, true, roomStatePayload(room));
      return;
    }

    if (msg.type === "netplay:start") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const gameId = String(payload.gameId || "").trim();
      const gameName = String(payload.gameName || "").trim() || "Netplay";
      const platform = String(payload.platform || "").trim() || "NES";
      const emulatorId = String(payload.emulatorId || "").trim().toLowerCase();
      const romHash = String(payload.romHash || "").trim().toLowerCase();
      const protocolVersion = String(payload.protocolVersion || "").trim() || "1";
      const coreVersion = String(payload.coreVersion || "").trim() || "unknown";
      const romBase64 = String(payload.romBase64 || "");
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (room.hostUserId !== actorId) {
        sendResponse(ws, msg.requestId, false, undefined, "Only host can start netplay");
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Not a room member");
        return;
      }
      if (!gameId || !romBase64 || !emulatorId || !romHash) {
        sendResponse(ws, msg.requestId, false, undefined, "gameId, romBase64, emulatorId and romHash are required");
        return;
      }

      room.session = {
        mode: "lockstep",
        gameId,
        gameName,
        platform,
        emulatorId,
        romHash,
        protocolVersion,
        coreVersion,
        romBase64,
        startedAt: new Date().toISOString()
      };
      emitRoomUpdate(room);

      sendEventToRoom(room, "netplay:start", {
        roomId: room.roomId,
        gameId,
        gameName,
        platform,
        emulatorId,
        romHash,
        protocolVersion,
        coreVersion,
        romBase64,
        hostUserId: room.hostUserId
      });
      sendResponse(ws, msg.requestId, true, { started: true });
      return;
    }

    if (msg.type === "stream:start") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const gameId = String(payload.gameId || "").trim();
      const gameName = String(payload.gameName || "").trim() || "Netplay";
      const platform = String(payload.platform || "").trim() || "NES";
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (room.hostUserId !== actorId) {
        sendResponse(ws, msg.requestId, false, undefined, "Only host can start stream");
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Not a room member");
        return;
      }
      if (!gameId) {
        sendResponse(ws, msg.requestId, false, undefined, "gameId is required");
        return;
      }
      const players = room.members.filter((id) => !room.spectators.includes(id));
      if (players.length !== 2) {
        sendResponse(ws, msg.requestId, false, undefined, "Streaming mode requires exactly 2 members");
        return;
      }

      room.session = {
        mode: "stream",
        gameId,
        gameName,
        platform,
        startedAt: new Date().toISOString()
      };
      emitRoomUpdate(room);

      sendEventToRoom(room, "stream:start", {
        roomId: room.roomId,
        gameId,
        gameName,
        platform,
        hostUserId: room.hostUserId
      });
      sendResponse(ws, msg.requestId, true, { started: true });
      return;
    }

    if (msg.type === "netplay:input") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const frame = Number(payload.frame);
      const state = Number(payload.state);
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Not a room member");
        return;
      }
      if (!room.session) {
        sendResponse(ws, msg.requestId, false, undefined, "Netplay not started");
        return;
      }
      if (room.session.mode !== "lockstep") {
        sendResponse(ws, msg.requestId, false, undefined, "Room is in streaming mode");
        return;
      }
      if (!Number.isFinite(frame) || !Number.isFinite(state)) {
        sendResponse(ws, msg.requestId, false, undefined, "frame and state are required");
        return;
      }

      sendEventToRoom(
        room,
        "netplay:input",
        {
          roomId: room.roomId,
          fromUserId: actorId,
          frame,
          state
        },
        actorId
      );
      if (msg.requestId) {
        sendResponse(ws, msg.requestId, true, { delivered: true });
      }
      return;
    }

    if (msg.type === "stream:signal") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const targetUserId = String(payload.targetUserId || "").trim();
      const signal = payload.signal;
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Not a room member");
        return;
      }
      if (!targetUserId || !room.members.includes(targetUserId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Target is not in room");
        return;
      }
      if (!signal || typeof signal !== "object") {
        sendResponse(ws, msg.requestId, false, undefined, "signal payload is required");
        return;
      }

      sendEventToUser(targetUserId, "stream:signal", {
        roomId: room.roomId,
        fromUserId: actorId,
        signal
      });
      if (msg.requestId) {
        sendResponse(ws, msg.requestId, true, { delivered: true });
      }
      return;
    }

    if (msg.type === "stream:input") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const state = Number(payload.state);
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Not a room member");
        return;
      }
      if (actorId === room.hostUserId) {
        sendResponse(ws, msg.requestId, false, undefined, "Host should not send stream input");
        return;
      }
      if (!Number.isFinite(state)) {
        sendResponse(ws, msg.requestId, false, undefined, "state is required");
        return;
      }
      if (!room.session || room.session.mode !== "stream") {
        sendResponse(ws, msg.requestId, false, undefined, "Streaming mode is not active");
        return;
      }

      sendEventToUser(room.hostUserId, "stream:input", {
        roomId: room.roomId,
        fromUserId: actorId,
        state
      });
      if (msg.requestId) {
        sendResponse(ws, msg.requestId, true, { delivered: true });
      }
      return;
    }

    if (msg.type === "room:pause") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const paused = payload.paused;
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Not a room member");
        return;
      }
      if (!room.session) {
        sendResponse(ws, msg.requestId, false, undefined, "Session is not active");
        return;
      }
      if (typeof paused !== "boolean") {
        sendResponse(ws, msg.requestId, false, undefined, "paused flag is required");
        return;
      }

      sendEventToRoom(
        room,
        "room:pause",
        {
          roomId: room.roomId,
          fromUserId: actorId,
          paused
        },
        actorId
      );
      if (msg.requestId) {
        sendResponse(ws, msg.requestId, true, { delivered: true });
      }
      return;
    }

    if (msg.type === "room:close") {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      if (!roomId) {
        sendResponse(ws, msg.requestId, false, undefined, "roomId is required");
        return;
      }
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, true, { closed: false });
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Not a room member");
        return;
      }

      if (room.hostUserId === actorId) {
        rooms.delete(room.roomId);
        for (const memberId of room.members) {
          if (memberId !== actorId) {
            sendEventToUser(memberId, "room:closed", { roomId: room.roomId });
          }
          broadcastPresence(memberId);
        }
      } else {
        room.members = room.members.filter((id) => id !== actorId);
        room.spectators = room.spectators.filter((id) => id !== actorId);
        room.readyByUserId = room.readyByUserId.filter((id) => id !== actorId && room.members.includes(id));
        emitRoomUpdate(room);
        broadcastPresence(actorId);
      }

      sendResponse(ws, msg.requestId, true, { closed: true });
      return;
    }

    if (msg.type === "invite:send") {
      const friendUserId = String(payload.friendUserId || "").trim();
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const gameId = String(payload.gameId || "").trim();

      if (!friendUserId || !roomId || !gameId) {
        sendResponse(ws, msg.requestId, false, undefined, "friendUserId, roomId and gameId are required");
        return;
      }
      if (!isOnline(friendUserId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Friend is offline");
        return;
      }
      if (!areFriends(actorId, friendUserId)) {
        sendResponse(ws, msg.requestId, false, undefined, "User is not in your friends list");
        return;
      }
      const room = rooms.get(roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room not found");
        return;
      }
      if (room.hostUserId !== actorId) {
        sendResponse(ws, msg.requestId, false, undefined, "Only host can send room invites");
        return;
      }
      if (!room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "You are not in the room");
        return;
      }

      const fromUser = getUserById(actorId);
      if (!fromUser) {
        sendResponse(ws, msg.requestId, false, undefined, "Sender not found");
        return;
      }

      const inviteId = uuidv4();
      invites.set(inviteId, {
        inviteId,
        fromUserId: actorId,
        toUserId: friendUserId,
        roomId,
        gameId,
        createdAt: new Date().toISOString()
      });

      sendEventToUser(friendUserId, "invite:received", {
        inviteId,
        fromUserId: actorId,
        fromDisplayName: fromUser.displayName,
        roomId,
        gameId
      });
      sendResponse(ws, msg.requestId, true, { inviteId });
      return;
    }

    if (msg.type === "invite:respond") {
      const inviteId = String(payload.inviteId || "").trim();
      const accept = Boolean(payload.accept);
      const invite = invites.get(inviteId);
      if (!invite) {
        sendResponse(ws, msg.requestId, false, undefined, "Invite not found");
        return;
      }
      if (invite.toUserId !== actorId) {
        sendResponse(ws, msg.requestId, false, undefined, "Invite does not belong to user");
        return;
      }

      invites.delete(inviteId);

      if (!accept) {
        sendEventToUser(invite.fromUserId, "invite:declined", { inviteId, byUserId: actorId });
        sendResponse(ws, msg.requestId, true, { declined: true });
        return;
      }

      const room = rooms.get(invite.roomId);
      if (!room) {
        sendResponse(ws, msg.requestId, false, undefined, "Room no longer exists");
        return;
      }
      if (room.session?.mode === "stream" && !room.members.includes(actorId) && room.members.length >= 2) {
        sendResponse(ws, msg.requestId, false, undefined, "Streaming room is full");
        return;
      }
      if (room.locked && !room.members.includes(actorId)) {
        sendResponse(ws, msg.requestId, false, undefined, "Room is locked");
        return;
      }

      if (!room.members.includes(actorId)) {
        room.members.push(actorId);
      }
      emitRoomUpdate(room);

      sendEventToUser(invite.fromUserId, "invite:accepted", {
        inviteId,
        userId: actorId,
        roomId: room.roomId
      });
      sendResponse(ws, msg.requestId, true, { roomId: room.roomId });
      return;
    }

    sendResponse(ws, msg.requestId, false, undefined, `Unknown type: ${msg.type}`);
  });

  ws.on("close", () => {
    const userId = socketUser.get(ws);
    dropSocketUser(ws);
    if (userId) {
      removeUserFromRooms(userId);
      broadcastPresence(userId);
    }
  });
});

console.log(`Signaling server started on ws://localhost:${PORT}`);

