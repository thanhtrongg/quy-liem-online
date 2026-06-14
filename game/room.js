const { randomUUID } = require("crypto");
const { randomCode } = require("./utils");
const { firstAvailableAvatar } = require("./avatars");

const DEFAULT_ROLES = { demon: 1, spirit: 0, seer: 0, witch: 0, guard: 0, villager: 1, springroll: 0, hunter: 0, cupid: 0, junior: 0, bisexual: 0, thangngoo: 0, priest: 0 };
const rooms = new Map();

function clearPhaseTimer(room) {
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
  room.phaseTimer = null;
  room.phaseEndsAt = null;
  room.phaseStartedAt = null;
}

function schedulePhase(room, duration, callback, displayDuration = duration) {
  clearPhaseTimer(room);
  room.phaseStartedAt = Date.now();
  room.phaseEndsAt = room.phaseStartedAt + displayDuration;
  room.phaseTimer = setTimeout(() => {
    room.phaseTimer = null;
    room.phaseEndsAt = null;
    room.phaseStartedAt = null;
    callback();
  }, duration);
}

function createRoom(hostSocket, name) {
  const code = randomCode();
  const playerId = randomUUID();
  const token = randomUUID();
  const room = {
    code,
    hostId: playerId,
    status: "lobby",
    phase: "lobby",
    day: 0,
    roles: { ...DEFAULT_ROLES },
    players: [{ id: playerId, socketId: hostSocket.id, token, name, avatarId: firstAvailableAvatar([]), alive: true, role: null, loverId: null, health: 1, connected: true }],
    actions: {},
    votes: {},
    verdicts: {},
    logs: [],
    witch: { save: true, poison: true },
    guardLastTarget: null,
    nightVictim: null,
    nightVictimReady: false,
    nightSteps: [],
    nightStepIndex: -1,
    nightStep: null,
    spiritNextKillNight: 3,
    seerResult: null,
    cupidPair: [],
    winner: null,
    pendingHunter: null,
    pendingAfterHunter: null,
    phaseEndsAt: null,
    phaseTimer: null,
    accusedId: null,
    hunterRevealId: null,
    villagePowersDisabled: false,
    priestChurch: []
  };
  rooms.set(code, room);
  hostSocket.join(code);
  hostSocket.data.roomCode = code;
  hostSocket.data.playerId = playerId;
  return room;
}

function resetRoomToLobby(room) {
  const { addLog } = require("./utils");
  clearPhaseTimer(room);
  room.status = "lobby";
  room.phase = "lobby";
  room.day = 0;
  room.actions = {};
  room.votes = {};
  room.verdicts = {};
  room.logs = [];
  room.witch = { save: true, poison: true };
  room.guardLastTarget = null;
  room.nightVictim = null;
  room.nightVictimReady = false;
  room.nightSteps = [];
  room.nightStepIndex = -1;
  room.nightStep = null;
  room.spiritNextKillNight = 3;
  room.seerResult = null;
  room.cupidPair = [];
  room.winner = null;
  room.pendingHunter = null;
  room.pendingAfterHunter = null;
  room.accusedId = null;
  room.hunterRevealId = null;
  room.villagePowersDisabled = false;
  room.priestChurch = [];
  room.players.forEach((player) => {
    player.alive = true;
    player.role = null;
    player.loverId = null;
    player.health = 1;
  });
  addLog(room, "Chủ phòng đã mở một ván mới. Hãy chuẩn bị.", "phase");
}

module.exports = { DEFAULT_ROLES, rooms, createRoom, resetRoomToLobby, clearPhaseTimer, schedulePhase };
