const express = require("express");
const http = require("http");
const path = require("path");
const { randomUUID } = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3030;
const VOTE_DURATION_MS = Number(process.env.VOTE_DURATION_MS) || 180000;
const DEFENSE_DURATION_MS = Number(process.env.DEFENSE_DURATION_MS) || 30000;

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));

const ROLE_INFO = {
  demon: { name: "Quỷ Liếm", team: "demon", description: "Mỗi đêm chọn một người để liếm đít. Sáng hôm sau người đó biến mất." },
  seer: { name: "Cô Bé Hay Đoán", team: "village", description: "Mỗi đêm đoán một người có phải Quỷ Liếm hay không." },
  witch: { name: "Cậu Bé Chơi Bùa", team: "village", description: "Có một bùa cứu và một bùa hại, mỗi bùa chỉ dùng một lần." },
  guard: { name: "Gã Béo Nóng Tính", team: "village", description: "Mỗi đêm bảo kê một người khỏi Quỷ Liếm." },
  villager: { name: "Anh Hàng Xóm", team: "village", description: "Không có kỹ năng đặc biệt. Hãy thảo luận và biểu quyết." },
  hunter: { name: "Lọ Vương", team: "village", description: "Khi chết, kéo theo một người xuống mồ." },
  cupid: { name: "Người Yêu Cũ", team: "village", description: "Đêm đầu ghép đôi hai người. Một người chết, người kia chết theo." },
  junior: { name: "Quỷ Liếm Nhí", team: "demon", description: "Chỉ được săn mồi khi tất cả Quỷ Liếm trưởng thành đã chết." }
};

const DEFAULT_ROLES = { demon: 1, seer: 1, witch: 1, guard: 1, villager: 2, hunter: 1, cupid: 1, junior: 0 };
const rooms = new Map();

const cleanName = (value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
const randomCode = () => {
  let code;
  do code = Math.random().toString(36).slice(2, 7).toUpperCase();
  while (rooms.has(code));
  return code;
};
const shuffle = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const getPlayer = (room, id) => room.players.find((p) => p.id === id);
const alive = (room) => room.players.filter((p) => p.alive);
const addLog = (room, message, type = "normal") => room.logs.push({ message, type, at: Date.now() });

function resetRoomToLobby(room) {
  clearPhaseTimer(room);
  room.status = "lobby";
  room.phase = "lobby";
  room.day = 0;
  room.actions = {};
  room.votes = {};
  room.logs = [];
  room.witch = { save: true, poison: true };
  room.guardLast = null;
  room.nightVictim = null;
  room.nightVictimReady = false;
  room.seerResult = null;
  room.cupidPair = [];
  room.winner = null;
  room.pendingHunter = null;
  room.pendingAfterHunter = null;
  room.accusedId = null;
  room.hunterRevealId = null;
  room.players.forEach((player) => {
    player.alive = true;
    player.role = null;
    player.loverId = null;
  });
  addLog(room, "Chủ phòng đã mở một ván mới. Hãy chuẩn bị.", "phase");
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
    players: [{ id: playerId, socketId: hostSocket.id, token, name, alive: true, role: null, loverId: null, connected: true }],
    actions: {},
    votes: {},
    logs: [],
    witch: { save: true, poison: true },
    guardLast: null,
    nightVictim: null,
    nightVictimReady: false,
    seerResult: null,
    cupidPair: [],
    winner: null,
    pendingHunter: null,
    pendingAfterHunter: null,
    phaseEndsAt: null,
    phaseTimer: null,
    accusedId: null,
    hunterRevealId: null
  };
  rooms.set(code, room);
  hostSocket.join(code);
  hostSocket.data.roomCode = code;
  hostSocket.data.playerId = playerId;
  return room;
}

function publicState(room, socketId) {
  const me = getPlayer(room, socketId);
  const isHost = room.hostId === socketId;
  const canSeeRoles = room.status === "ended";
  const teamMates = me?.role && ROLE_INFO[me.role].team === "demon"
    ? room.players.filter((p) => p.id !== me.id && p.role && ROLE_INFO[p.role].team === "demon").map((p) => p.id)
    : [];
  const seerResult = room.seerResult?.viewer === socketId ? room.seerResult : null;
  const publicBallots = ["day", "defense"].includes(room.phase) ? room.votes : {};
  const votesByTarget = {};
  const blankVoters = [];
  Object.entries(publicBallots).forEach(([voterId, targetId]) => {
    if (targetId) (votesByTarget[targetId] ||= []).push(voterId);
    else if (room.phase === "day") blankVoters.push(voterId);
  });
  return {
    code: room.code,
    isHost,
    status: room.status,
    phase: room.phase,
    day: room.day,
    winner: room.winner,
    phaseEndsAt: room.phaseEndsAt,
    accusedId: room.accusedId,
    accusedName: getPlayer(room, room.accusedId)?.name || null,
    hunterRevealName: getPlayer(room, room.hunterRevealId)?.name || null,
    roles: room.roles,
    roleInfo: ROLE_INFO,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      connected: p.connected,
      role: canSeeRoles || p.id === socketId || teamMates.includes(p.id) || room.hunterRevealId === p.id ? p.role : null
    })),
    me: me ? {
      id: me.id,
      name: me.name,
      alive: me.alive,
      role: me.role,
      cupidPair: me.role === "cupid" ? room.cupidPair : [],
      description: me.role ? ROLE_INFO[me.role].description : null
    } : null,
    votesByTarget,
    blankVoters,
    action: actionFor(room, me),
    seerResult,
    logs: room.logs.slice(-30),
    witch: me?.role === "witch" ? room.witch : null,
    pendingHunter: room.pendingHunter === socketId
  };
}

function actionFor(room, me) {
  if (!me || room.status !== "playing") return null;
  if (room.phase === "hunter" && room.pendingHunter === me.id) return { type: "hunter", label: "Chọn người kéo xuống mồ", count: 1 };
  if (!me.alive) return null;
  if (room.phase === "day") return { type: "vote", label: "Bỏ phiếu treo cổ", count: 1, allowSkip: true, currentTarget: room.votes[me.id] ?? null };
  if (room.phase === "defense" && room.votes[me.id] === room.accusedId) return { type: "withdraw", label: "Rút phiếu buộc tội", count: 0 };
  if (room.phase !== "night" || room.actions[me.id]) return null;
  if (me.role === "cupid" && room.day === 1) return { type: "cupid", label: "Ghép đôi hai người", count: 2 };
  if (me.role === "guard") return { type: "guard", label: "Chọn người bảo kê", count: 1, exclude: room.guardLast ? [room.guardLast] : [] };
  if (me.role === "seer") return { type: "seer", label: "Chọn người để soi", count: 1 };
  if (me.role === "witch" && room.nightVictimReady) return { type: "witch", label: "Dùng bùa hoặc bỏ qua", count: 1, allowSkip: true, victimId: room.nightVictim };
  if (me.role === "demon") return { type: "demon", label: "Chọn người để liếm", count: 1, excludeTeam: true };
  if (me.role === "junior" && !alive(room).some((p) => p.role === "demon")) return { type: "junior", label: "Chọn người để liếm", count: 1, excludeTeam: true };
  return null;
}

function emitRoom(room) {
  for (const player of room.players) {
    if (player.socketId) io.to(player.socketId).emit("state", publicState(room, player.id));
  }
}

function clearPhaseTimer(room) {
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
  room.phaseTimer = null;
  room.phaseEndsAt = null;
}

function schedulePhase(room, duration, callback) {
  clearPhaseTimer(room);
  room.phaseEndsAt = Date.now() + duration;
  room.phaseTimer = setTimeout(() => {
    room.phaseTimer = null;
    room.phaseEndsAt = null;
    callback();
  }, duration);
}

function requiredNightActors(room) {
  return alive(room).filter((p) => {
    const action = actionFor(room, p);
    return action && action.type !== "witch";
  });
}

function setNightVictimIfReady(room) {
  const adults = alive(room).filter((p) => p.role === "demon");
  const hunters = adults.length ? adults : alive(room).filter((p) => p.role === "junior");
  if (!hunters.length || !hunters.every((p) => room.actions[p.id])) return false;
  const counts = {};
  hunters.forEach((p) => {
    const target = room.actions[p.id].targets[0];
    if (target) counts[target] = (counts[target] || 0) + 1;
  });
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((id) => counts[id] === max);
  room.nightVictim = top.length === 1 ? top[0] : null;
  room.nightVictimReady = true;
  return true;
}

function checkNightReady(room) {
  setNightVictimIfReady(room);
  const required = requiredNightActors(room);
  const baseReady = required.every((p) => room.actions[p.id]);
  if (!baseReady) return;
  setNightVictimIfReady(room);
  const witch = alive(room).find((p) => p.role === "witch");
  if (witch && !room.actions[witch.id]) {
    emitRoom(room);
    return;
  }
  resolveNight(room);
}

function killWithChains(room, ids, reason) {
  const deathPhase = room.phase;
  const queue = ids.filter(Boolean);
  const dead = [];
  while (queue.length) {
    const id = queue.shift();
    const player = getPlayer(room, id);
    if (!player?.alive) continue;
    player.alive = false;
    dead.push(player);
    addLog(room, `${player.name} đã chết${reason ? ` (${reason})` : ""}.`, "death");
    if (player.loverId && getPlayer(room, player.loverId)?.alive) queue.push(player.loverId);
  }
  const hunter = dead.find((p) => p.role === "hunter");
  if (hunter) {
    room.pendingHunter = hunter.id;
    room.hunterRevealId = hunter.id;
    if (deathPhase !== "night") {
      room.pendingAfterHunter = deathPhase === "day" ? "night" : deathPhase;
      room.phase = "hunter";
    }
  }
  return dead;
}

function resolveNight(room) {
  const guard = alive(room).find((p) => p.role === "guard");
  const guardTarget = guard ? room.actions[guard.id]?.targets[0] : null;
  room.guardLast = guardTarget || null;
  const witch = alive(room).find((p) => p.role === "witch");
  const witchAction = witch ? room.actions[witch.id] : null;
  let victim = room.nightVictim;
  if (victim && guardTarget === victim) victim = null;
  if (witchAction?.mode === "save" && victim) {
    victim = null;
    room.witch.save = false;
  }
  const deaths = [];
  if (victim) deaths.push(victim);
  if (witchAction?.mode === "poison" && witchAction.targets[0]) {
    deaths.push(witchAction.targets[0]);
    room.witch.poison = false;
  }
  addLog(room, deaths.length ? "Đêm qua khu phố đã có biến." : "Đêm qua bình yên lạ thường.", "phase");
  killWithChains(room, deaths, "trong đêm");
  if (room.pendingHunter) beginDay(room, true);
  else if (!checkWinner(room)) beginDay(room);
  emitRoom(room);
}

function beginDay(room, waitForHunter = false) {
  if (!waitForHunter && checkWinner(room)) return false;
  room.phase = "day";
  room.votes = {};
  room.actions = {};
  room.accusedId = null;
  room.nightVictim = null;
  room.nightVictimReady = false;
  addLog(room, `Ngày ${room.day}: Mọi người hãy thảo luận và bỏ phiếu.`, "phase");
  if (waitForHunter) {
    room.pendingAfterHunter = "day";
    room.phase = "hunter";
    addLog(room, `${getPlayer(room, room.pendingHunter)?.name} chính là Lọ Vương và đang chọn một người đi theo.`, "phase");
  } else {
    startDayVote(room);
  }
  return true;
}

function startDayVote(room) {
  room.phase = "day";
  room.votes = {};
  room.actions = {};
  room.accusedId = null;
  addLog(room, "Bỏ phiếu bắt đầu. Khu phố có 3 phút để chọn hoặc bỏ phiếu trắng.", "phase");
  schedulePhase(room, VOTE_DURATION_MS, () => finishDayVote(room));
  emitRoom(room);
}

function beginNight(room) {
  clearPhaseTimer(room);
  if (checkWinner(room)) return false;
  room.day += 1;
  room.phase = "night";
  room.actions = {};
  room.votes = {};
  room.nightVictim = null;
  room.nightVictimReady = false;
  room.accusedId = null;
  addLog(room, `Đêm ${room.day}: Khu phố chìm vào bóng tối.`, "phase");
  setTimeout(() => {
    if (room.phase === "night") checkNightReady(room);
  }, 100);
  return true;
}

function finishDayVote(room) {
  if (room.phase !== "day") return;
  clearPhaseTimer(room);
  const counts = {};
  Object.values(room.votes).forEach((target) => {
    if (target) counts[target] = (counts[target] || 0) + 1;
  });
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((id) => counts[id] === max);
  if (max === 0 || top.length !== 1) {
    addLog(room, max === 0 ? "Khu phố bỏ phiếu trắng. Không ai bị buộc tội." : "Cuộc bỏ phiếu hòa. Không ai bị buộc tội.", "phase");
    beginNight(room);
    emitRoom(room);
    return;
  }
  room.accusedId = top[0];
  room.phase = "defense";
  addLog(room, `${getPlayer(room, room.accusedId).name} có 30 giây phản biện. Những người đã buộc tội có thể rút phiếu.`, "phase");
  schedulePhase(room, DEFENSE_DURATION_MS, () => finishDefense(room));
  emitRoom(room);
}

function finishDefense(room) {
  if (room.phase !== "defense") return;
  clearPhaseTimer(room);
  const remaining = Object.values(room.votes).filter((target) => target === room.accusedId).length;
  if (!remaining) {
    addLog(room, `Mọi người đã rút phiếu. ${getPlayer(room, room.accusedId)?.name} được sống.`, "phase");
    room.accusedId = null;
    beginNight(room);
    emitRoom(room);
    return;
  }
  const accusedId = room.accusedId;
  room.accusedId = null;
  killWithChains(room, [accusedId], "bị khu phố treo cổ");
  if (room.phase !== "hunter") {
    if (checkWinner(room)) return;
    beginNight(room);
  }
  emitRoom(room);
}

function checkWinner(room) {
  const living = alive(room);
  const demons = living.filter((p) => ROLE_INFO[p.role]?.team === "demon");
  const villagers = living.filter((p) => ROLE_INFO[p.role]?.team === "village");
  if (!demons.length) room.winner = "village";
  else if (demons.length >= villagers.length) room.winner = "demon";
  if (!room.winner) return false;
  clearPhaseTimer(room);
  room.status = "ended";
  room.phase = "ended";
  addLog(room, room.winner === "village" ? "Phe khu phố đã chiến thắng!" : "Phe Quỷ Liếm đã nuốt chửng khu phố!", "win");
  emitRoom(room);
  return true;
}

function validateTargets(room, player, action, targets) {
  const valid = Array.isArray(targets) && targets.every((id) => room.players.some((p) => p.id === id && p.alive));
  if (!valid || targets.length !== action.count || new Set(targets).size !== targets.length) return false;
  if (action.exclude?.some((id) => targets.includes(id))) return false;
  if (action.excludeTeam && targets.some((id) => ROLE_INFO[getPlayer(room, id)?.role]?.team === "demon")) return false;
  return true;
}

io.on("connection", (socket) => {
  socket.on("create-room", ({ name }, callback) => {
    const safeName = cleanName(name);
    if (!safeName) return callback?.({ error: "Hãy nhập tên của bạn." });
    const room = createRoom(socket, safeName);
    addLog(room, `${safeName} đã tạo phòng.`);
    callback?.({ ok: true, code: room.code, token: room.players[0].token });
    emitRoom(room);
  });

  socket.on("join-room", ({ name, code }, callback) => {
    const safeName = cleanName(name);
    const room = rooms.get(String(code || "").toUpperCase());
    if (!safeName) return callback?.({ error: "Hãy nhập tên của bạn." });
    if (!room || room.status !== "lobby") return callback?.({ error: "Phòng không tồn tại hoặc đã bắt đầu." });
    if (room.players.some((p) => p.name.toLowerCase() === safeName.toLowerCase())) return callback?.({ error: "Tên này đã có trong phòng." });
    const player = { id: randomUUID(), socketId: socket.id, token: randomUUID(), name: safeName, alive: true, role: null, loverId: null, connected: true };
    room.players.push(player);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    addLog(room, `${safeName} đã vào phòng.`);
    callback?.({ ok: true, code: room.code, token: player.token });
    emitRoom(room);
  });

  socket.on("resume", ({ code, token }, callback) => {
    const room = rooms.get(String(code || "").toUpperCase());
    const player = room?.players.find((p) => p.token === token);
    if (!room || !player) return callback?.({ error: "Phiên chơi cũ không còn tồn tại." });
    player.socketId = socket.id;
    player.connected = true;
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    callback?.({ ok: true });
    emitRoom(room);
  });

  socket.on("set-roles", (roles) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.data.playerId || room.status !== "lobby") return;
    for (const key of Object.keys(DEFAULT_ROLES)) room.roles[key] = Math.max(0, Math.min(20, Number(roles[key]) || 0));
    emitRoom(room);
  });

  socket.on("replay-room", (_, callback) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.data.playerId || room.status !== "ended") {
      return callback?.({ error: "Chỉ chủ phòng có thể mở lại ván." });
    }
    resetRoomToLobby(room);
    callback?.({ ok: true });
    emitRoom(room);
  });

  socket.on("start-game", (_, callback) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.data.playerId || room.status !== "lobby") return;
    const deck = Object.entries(room.roles).flatMap(([role, count]) => Array(count).fill(role));
    if (room.players.length < 4) return callback?.({ error: "Cần ít nhất 4 người chơi." });
    if (deck.length !== room.players.length) return callback?.({ error: `Tổng số vai (${deck.length}) phải bằng số người (${room.players.length}).` });
    if (!deck.includes("demon")) return callback?.({ error: "Cần ít nhất một Quỷ Liếm trưởng thành." });
    const shuffled = shuffle(deck);
    room.players.forEach((p, index) => { p.role = shuffled[index]; p.alive = true; p.loverId = null; });
    room.cupidPair = [];
    room.hunterRevealId = null;
    room.accusedId = null;
    room.phaseEndsAt = null;
    room.status = "playing";
    addLog(room, "Trò chơi bắt đầu. Vai đã được phân bí mật.", "phase");
    beginNight(room);
    callback?.({ ok: true });
    emitRoom(room);
  });

  socket.on("act", ({ targets = [], mode = null }, callback) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room && getPlayer(room, socket.data.playerId);
    const action = room && actionFor(room, player);
    if (!room || !player || !action) return callback?.({ error: "Hiện tại bạn không thể thực hiện hành động này." });
    if (action.type === "withdraw") {
      room.votes[player.id] = null;
      addLog(room, `${player.name} đã rút phiếu buộc tội.`, "phase");
    } else if (action.allowSkip && mode === "skip") {
      if (action.type === "vote") room.votes[player.id] = null;
      else room.actions[player.id] = { targets: [], mode: "skip" };
    } else if (action.type === "witch") {
      if (!["save", "poison"].includes(mode)) return callback?.({ error: "Lựa chọn không hợp lệ." });
      if (mode === "save" && (!room.witch.save || !room.nightVictim)) return callback?.({ error: "Không thể dùng bùa cứu lúc này." });
      if (mode === "poison" && (!room.witch.poison || !validateTargets(room, player, action, targets))) return callback?.({ error: "Không thể dùng bùa hại lúc này." });
      room.actions[player.id] = { targets: mode === "save" ? [room.nightVictim] : targets, mode };
    } else if (!validateTargets(room, player, action, targets)) {
      return callback?.({ error: "Mục tiêu không hợp lệ." });
    } else if (action.type === "vote") {
      room.votes[player.id] = targets[0];
    } else if (action.type === "hunter") {
      killWithChains(room, [targets[0]], "bị Lọ Vương kéo theo");
      room.pendingHunter = null;
      if (checkWinner(room)) return callback?.({ ok: true });
      const resume = room.pendingAfterHunter;
      room.pendingAfterHunter = null;
      if (resume === "day") {
        if (!checkWinner(room)) startDayVote(room);
      } else {
        beginNight(room);
      }
    } else {
      room.actions[player.id] = { targets, mode };
      if (action.type === "cupid") {
        const [a, b] = targets.map((id) => getPlayer(room, id));
        a.loverId = b.id;
        b.loverId = a.id;
        room.cupidPair = [a.id, b.id];
      }
      if (action.type === "seer") {
        const target = getPlayer(room, targets[0]);
        room.seerResult = { viewer: player.id, targetName: target.name, isDemon: ROLE_INFO[target.role].team === "demon" };
      }
    }
    callback?.({ ok: true });
    if (room.phase === "day" && Object.keys(room.votes).length >= alive(room).length) finishDayVote(room);
    else if (room.phase === "defense" && !Object.values(room.votes).some((target) => target === room.accusedId)) finishDefense(room);
    else if (room.phase === "night") checkNightReady(room);
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = getPlayer(room, socket.data.playerId);
    if (player) {
      player.connected = false;
      player.socketId = null;
    }
    if (room.status === "lobby") {
      setTimeout(() => {
        if (player && !player.connected && room.status === "lobby") {
          room.players = room.players.filter((p) => p.id !== player.id);
          if (!room.players.length) rooms.delete(room.code);
          else if (room.hostId === player.id) room.hostId = room.players[0].id;
          emitRoom(room);
        }
      }, 15000);
    }
    emitRoom(room);
  });
});

server.listen(PORT, () => console.log(`Quỷ Liếm đang chạy tại http://localhost:${PORT}`));
