const { randomUUID } = require("crypto");
const { randomCode } = require("./utils");

const DEFAULT_ROLES = { demon: 1, spirit: 0, seer: 1, witch: 1, guard: 1, villager: 2, springroll: 0, hunter: 1, cupid: 1, junior: 0 };
const rooms = new Map();

function clearPhaseTimer(room) {
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
  room.phaseTimer = null;
  room.phaseEndsAt = null;
  room.phaseStartedAt = null;
}

function schedulePhase(room, duration, callback) {
  clearPhaseTimer(room);
  room.phaseStartedAt = Date.now();
  room.phaseEndsAt = Date.now() + duration;
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
    players: [{ id: playerId, socketId: hostSocket.id, token, name, alive: true, role: null, loverId: null, health: 1, connected: true }],
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
    seerResult: null,
    cupidPair: [],
    winner: null,
    pendingHunter: null,
    pendingAfterHunter: null,
    phaseEndsAt: null,
    phaseTimer: null,
    accusedId: null,
    hunterRevealId: null,
    villagePowersDisabled: false
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
  room.seerResult = null;
  room.cupidPair = [];
  room.winner = null;
  room.pendingHunter = null;
  room.pendingAfterHunter = null;
  room.accusedId = null;
  room.hunterRevealId = null;
  room.villagePowersDisabled = false;
  room.players.forEach((player) => {
    player.alive = true;
    player.role = null;
    player.loverId = null;
    player.health = 1;
  });
  addLog(room, "Chủ phòng đã mở một ván mới. Hãy chuẩn bị.", "phase");
}

module.exports = { DEFAULT_ROLES, rooms, createRoom, resetRoomToLobby, clearPhaseTimer, schedulePhase };
