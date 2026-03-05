import WebSocket from "ws";
import crypto from "node:crypto";

const URL = process.env.SMOKE_SIGNALING_URL || "ws://127.0.0.1:8787";
const TIMEOUT_MS = 8000;

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), TIMEOUT_MS);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

class Client {
  constructor(name) {
    this.name = name;
    this.ws = new WebSocket(URL);
    this.pending = new Map();
    this.events = [];
    this.waiters = [];
    this.ws.on("message", (raw) => {
      let data;
      try {
        data = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (data?.type === "response" && data.requestId) {
        const entry = this.pending.get(data.requestId);
        if (!entry) return;
        this.pending.delete(data.requestId);
        if (data.ok) entry.resolve(data.payload);
        else entry.reject(new Error(data.error || `${this.name}: request failed`));
        return;
      }
      if (data?.type === "event") {
        this.events.push(data);
        this.flushWaiters();
      }
    });
  }

  async connectAndAuth(userId) {
    await waitForOpen(this.ws);
    await this.request("auth", {
      userId,
      displayName: userId,
      friendCode: userId
    });
  }

  request(type, payload = {}) {
    const requestId = crypto.randomUUID();
    const body = JSON.stringify({ type, requestId, payload });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${this.name}: request timeout for ${type}`));
      }, TIMEOUT_MS);
      this.pending.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.ws.send(body);
    });
  }

  waitEvent(eventName, predicate = () => true) {
    const foundIndex = this.events.findIndex((item) => item.event === eventName && predicate(item.payload));
    if (foundIndex >= 0) {
      return Promise.resolve(this.events.splice(foundIndex, 1)[0].payload);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name}: event timeout for ${eventName}`)), TIMEOUT_MS);
      this.waiters.push({
        eventName,
        predicate,
        resolve: (payload) => {
          clearTimeout(timer);
          resolve(payload);
        }
      });
    });
  }

  flushWaiters() {
    if (!this.waiters.length || !this.events.length) return;
    const nextWaiters = [];
    for (const waiter of this.waiters) {
      const index = this.events.findIndex((item) => item.event === waiter.eventName && waiter.predicate(item.payload));
      if (index >= 0) {
        const [event] = this.events.splice(index, 1);
        waiter.resolve(event.payload);
      } else {
        nextWaiters.push(waiter);
      }
    }
    this.waiters = nextWaiters;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // noop
    }
  }
}

async function run() {
  const host = new Client("host");
  const guest = new Client("guest");
  try {
    await Promise.all([
      host.connectAndAuth(`host-${Date.now()}`),
      guest.connectAndAuth(`guest-${Date.now()}`)
    ]);

    const room = await host.request("room:create", { gameId: "smoke-game" });
    if (!room?.roomId) throw new Error("room:create did not return roomId");

    await guest.request("room:join", { roomId: room.roomId });
    const roomState = await host.request("room:state", { roomId: room.roomId });
    if (!Array.isArray(roomState?.members) || roomState.members.length < 2) {
      throw new Error("room:state does not contain both members");
    }

    await host.request("netplay:start", {
      roomId: room.roomId,
      gameId: "smoke-game",
      gameName: "Smoke",
      platform: "NES",
      romBase64: "AQ==",
      emulatorId: "nes",
      romHash: "smokehash",
      protocolVersion: "1",
      coreVersion: "jsnes"
    });
    await guest.waitEvent("netplay:start", (payload) => payload.roomId === room.roomId);

    await host.request("room:pause", { roomId: room.roomId, paused: true });
    await guest.waitEvent("room:pause", (payload) => payload.roomId === room.roomId && payload.paused === true);

    await host.request("session:stop", { roomId: room.roomId });
    await guest.waitEvent("session:stop", (payload) => payload.roomId === room.roomId);

    await host.request("ping", { t: Date.now() });
    console.log(`Smoke test passed: ${room.roomId} on ${URL}`);
  } finally {
    host.close();
    guest.close();
  }
}

run().catch((error) => {
  console.error(`Smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
