"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const bridge = {
    addGame: () => electron_1.ipcRenderer.invoke("games:add"),
    listGames: () => electron_1.ipcRenderer.invoke("games:list"),
    removeGame: (gameId) => electron_1.ipcRenderer.invoke("games:remove", gameId),
    setGameCover: (gameId, dataUrl) => electron_1.ipcRenderer.invoke("games:setCover", gameId, dataUrl),
    updateGameEmulator: (gameId, emulatorId) => electron_1.ipcRenderer.invoke("games:updateEmulator", gameId, emulatorId),
    updateGameRetroId: (gameId, retroAchievementsGameId) => electron_1.ipcRenderer.invoke("games:updateRetroId", gameId, retroAchievementsGameId),
    openRomFolder: (gameId) => electron_1.ipcRenderer.invoke("games:openRomFolder", gameId),
    startLocalGame: (gameId) => electron_1.ipcRenderer.invoke("games:startLocal", gameId),
    checkGameLaunch: (gameId) => electron_1.ipcRenderer.invoke("games:checkLaunch", gameId),
    createRoom: (gameId) => electron_1.ipcRenderer.invoke("room:create", gameId),
    joinRoom: (roomId, spectator) => electron_1.ipcRenderer.invoke("room:join", roomId, spectator),
    getRoomState: (roomId) => electron_1.ipcRenderer.invoke("room:getState", roomId),
    closeRoom: (roomId) => electron_1.ipcRenderer.invoke("room:close", roomId),
    setRoomReady: (roomId, ready) => electron_1.ipcRenderer.invoke("room:setReady", roomId, ready),
    setRoomLock: (roomId, locked) => electron_1.ipcRenderer.invoke("room:setLock", roomId, locked),
    kickRoomMember: (roomId, targetUserId) => electron_1.ipcRenderer.invoke("room:kick", roomId, targetUserId),
    transferRoomHost: (roomId, targetUserId) => electron_1.ipcRenderer.invoke("room:transferHost", roomId, targetUserId),
    getRoomChatHistory: (roomId) => electron_1.ipcRenderer.invoke("room:getChatHistory", roomId),
    sendRoomChat: (roomId, text) => electron_1.ipcRenderer.invoke("room:sendChat", roomId, text),
    setFullscreen: (enabled) => electron_1.ipcRenderer.invoke("window:setFullscreen", enabled),
    getProfile: () => electron_1.ipcRenderer.invoke("profile:get"),
    updateProfile: (displayName) => electron_1.ipcRenderer.invoke("profile:update", displayName),
    updateProfileAvatar: (avatarDataUrl) => electron_1.ipcRenderer.invoke("profile:updateAvatar", avatarDataUrl),
    getControls: () => electron_1.ipcRenderer.invoke("settings:getControls"),
    saveControls: (payload) => electron_1.ipcRenderer.invoke("settings:saveControls", payload),
    getAudioSettings: () => electron_1.ipcRenderer.invoke("settings:getAudio"),
    saveAudioSettings: (payload) => electron_1.ipcRenderer.invoke("settings:saveAudio", payload),
    getVideoSettings: () => electron_1.ipcRenderer.invoke("settings:getVideo"),
    saveVideoSettings: (payload) => electron_1.ipcRenderer.invoke("settings:saveVideo", payload),
    getReplaySettings: () => electron_1.ipcRenderer.invoke("settings:getReplay"),
    saveReplaySettings: (payload) => electron_1.ipcRenderer.invoke("settings:saveReplay", payload),
    getNetworkSettings: () => electron_1.ipcRenderer.invoke("settings:getNetwork"),
    saveNetworkSettings: (payload) => electron_1.ipcRenderer.invoke("settings:saveNetwork", payload),
    getLocalServerStatus: () => electron_1.ipcRenderer.invoke("network:getLocalServerStatus"),
    startLocalServer: (signalingUrl) => electron_1.ipcRenderer.invoke("network:startLocalServer", signalingUrl),
    stopLocalServer: () => electron_1.ipcRenderer.invoke("network:stopLocalServer"),
    getNgrokStatus: () => electron_1.ipcRenderer.invoke("network:getNgrokStatus"),
    startNgrok: (signalingUrl) => electron_1.ipcRenderer.invoke("network:startNgrok", signalingUrl),
    stopNgrok: () => electron_1.ipcRenderer.invoke("network:stopNgrok"),
    getUiSettings: () => electron_1.ipcRenderer.invoke("settings:getUi"),
    saveUiSettings: (payload) => electron_1.ipcRenderer.invoke("settings:saveUi", payload),
    getRaApiKeyStatus: () => electron_1.ipcRenderer.invoke("settings:getRaApiKeyStatus"),
    setRaApiKey: (apiKey) => electron_1.ipcRenderer.invoke("settings:setRaApiKey", apiKey),
    clearRaApiKey: () => electron_1.ipcRenderer.invoke("settings:clearRaApiKey"),
    connectServer: (signalingUrl) => electron_1.ipcRenderer.invoke("server:connect", signalingUrl),
    ensureStreamFirewallAccess: () => electron_1.ipcRenderer.invoke("network:ensureStreamFirewallAccess"),
    covers: {
        pickCover: (gameId) => electron_1.ipcRenderer.invoke("covers:pick", gameId),
        removeCover: (gameId) => electron_1.ipcRenderer.invoke("covers:remove", gameId),
        getCoverDataUrl: (gameId) => electron_1.ipcRenderer.invoke("covers:getCoverDataUrl", gameId)
    },
    replays: {
        saveReplay: (payload) => electron_1.ipcRenderer.invoke("replays:save", payload),
        openFolder: () => electron_1.ipcRenderer.invoke("replays:openFolder"),
        openSavedFile: (filePath) => electron_1.ipcRenderer.invoke("replays:openSavedFile", filePath)
    }
};
electron_1.contextBridge.exposeInMainWorld("bridge", bridge);
electron_1.contextBridge.exposeInMainWorld("ra", {
    getGameData: (payload) => electron_1.ipcRenderer.invoke("ra:getGameData", payload)
});
