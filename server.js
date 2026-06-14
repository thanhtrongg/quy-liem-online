const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const { cleanName, shuffle, getPlayer, alive, addLog } = require("./game/utils");
const { ROLE_INFO } = require("./game/roles");
const { isValidAvatarId, firstAvailableAvatar, ensureUniqueAvatars } = require("./game/avatars");
const { rooms, DEFAULT_ROLES, createRoom, resetRoomToLobby, clearPhaseTimer } = require("./game/room");
const { emitRoom, actionFor, canShareVoice } = require("./game/state");
const {
  validateTargets, killWithChains, checkWinner, beginDay, beginNight,
  startDayVote, finishDayVote, finishDefense, checkNightReady
} = require("./game/engine");
const { pick } = require("./game/narrative");

function fmt(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "???");
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3030;
const HOST = process.env.HOST || "0.0.0.0";
const publicDir = path.join(__dirname, "public");

app.disable("x-powered-by");
app.get("/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({ ok: true, uptime: Math.round(process.uptime()) });
});
app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.use(express.static(publicDir, {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".cur")) {
      res.setHeader("Content-Type", "image/x-icon");
    }
  },
}));

io.on("connection", (socket) => {
  socket.on("create-room", ({ name }, callback) => {
    const safeName = cleanName(name);
    if (!safeName) return callback?.({ error: "Hãy nhập tên của bạn." });
    const room = createRoom(socket, safeName);
    addLog(room, `${safeName} đã tạo phòng.`);
    callback?.({ ok: true, code: room.code, token: room.players[0].token });
    emitRoom(io, room);
  });

  socket.on("join-room", ({ name, code }, callback) => {
    const safeName = cleanName(name);
    const room = rooms.get(String(code || "").toUpperCase());
    if (!safeName) return callback?.({ error: "Hãy nhập tên của bạn." });
    if (!room || room.status !== "lobby") return callback?.({ error: "Phòng không tồn tại hoặc đã bắt đầu." });
    if (room.players.some((p) => p.name.toLowerCase() === safeName.toLowerCase())) return callback?.({ error: "Tên này đã có trong phòng." });
    ensureUniqueAvatars(room.players);
    const avatarId = firstAvailableAvatar(room.players);
    if (avatarId === null) return callback?.({ error: "Phòng đã hết avatar trống." });
    const { randomUUID } = require("crypto");
    const player = { id: randomUUID(), socketId: socket.id, token: randomUUID(), name: safeName, avatarId, alive: true, role: null, loverId: null, connected: true };
    room.players.push(player);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    addLog(room, `${safeName} đã vào phòng.`);
    callback?.({ ok: true, code: room.code, token: player.token });
    emitRoom(io, room);
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
    emitRoom(io, room);
  });

  socket.on("set-roles", (roles) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.data.playerId || room.status !== "lobby") return;
    for (const key of Object.keys(DEFAULT_ROLES)) {
      const maximum = key === "spirit" ? 1 : 20;
      room.roles[key] = Math.max(0, Math.min(maximum, Number(roles[key]) || 0));
    }
    emitRoom(io, room);
  });

  socket.on("replay-room", (_, callback) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.data.playerId || room.status !== "ended") {
      return callback?.({ error: "Chỉ chủ phòng có thể mở lại ván." });
    }
    resetRoomToLobby(room);
    callback?.({ ok: true });
    emitRoom(io, room);
  });

  socket.on("kick-player", ({ playerId }, callback) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.data.playerId || room.status !== "lobby") {
      return callback?.({ error: "Chỉ chủ phòng có thể kick thành viên khi đang ở sảnh chờ." });
    }
    if (!playerId || playerId === room.hostId) return callback?.({ error: "Không thể kick chủ phòng." });
    const target = getPlayer(room, playerId);
    if (!target) return callback?.({ error: "Không tìm thấy thành viên." });
    room.players = room.players.filter((player) => player.id !== playerId);
    addLog(room, `${target.name} đã bị chủ phòng kick.`);
    if (target.socketId) {
      const targetSocket = io.sockets.sockets.get(target.socketId);
      targetSocket?.leave(room.code);
      if (targetSocket) {
        targetSocket.data.roomCode = null;
        targetSocket.data.playerId = null;
      }
      io.to(target.socketId).emit("room-closed", { reason: "Bạn đã bị chủ phòng kick khỏi phòng." });
    }
    callback?.({ ok: true });
    emitRoom(io, room);
  });

  socket.on("leave-room", (_, callback) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room && getPlayer(room, socket.data.playerId);
    if (!room || !player) return callback?.({ error: "Bạn không ở trong phòng nào." });
    if (player.id === room.hostId) return callback?.({ error: "Chủ phòng hãy dùng nút Hủy phòng." });
    if (!["lobby", "ended"].includes(room.status)) {
      return callback?.({ error: "Không thể rời phòng khi ván đấu đang diễn ra." });
    }
    room.players = room.players.filter((member) => member.id !== player.id);
    addLog(room, `${player.name} đã rời phòng.`);
    socket.leave(room.code);
    socket.data.roomCode = null;
    socket.data.playerId = null;
    callback?.({ ok: true });
    socket.emit("room-closed", { reason: "Bạn đã rời phòng." });
    emitRoom(io, room);
  });

  socket.on("cancel-room", (_, callback) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.data.playerId) {
      return callback?.({ error: "Chỉ chủ phòng có thể hủy phòng." });
    }
    clearPhaseTimer(room);
    rooms.delete(room.code);
    for (const player of room.players) {
      if (!player.socketId) continue;
      const playerSocket = io.sockets.sockets.get(player.socketId);
      playerSocket?.leave(room.code);
      if (playerSocket) {
        playerSocket.data.roomCode = null;
        playerSocket.data.playerId = null;
      }
      io.to(player.socketId).emit("room-closed", { reason: "Chủ phòng đã hủy phòng hiện tại." });
    }
    callback?.({ ok: true });
  });

  socket.on("start-game", (_, callback) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.data.playerId || room.status !== "lobby") return;
    const deck = Object.entries(room.roles).flatMap(([role, count]) => Array(count).fill(role));
    if (room.players.length < 4) return callback?.({ error: "Cần ít nhất 4 người chơi." });
    if (deck.length !== room.players.length) return callback?.({ error: `Tổng số vai (${deck.length}) phải bằng số người (${room.players.length}).` });
    if (!deck.includes("demon")) return callback?.({ error: "Cần ít nhất một Quỷ Liếm trưởng thành." });
    const shuffled = shuffle(deck);
    room.players.forEach((p, index) => {
      p.role = shuffled[index];
      p.alive = true;
      p.loverId = null;
      p.health = p.role === "springroll" ? 2 : 1;
    });
    room.villagePowersDisabled = false;
    room.guardLastTarget = null;
    room.spiritNextKillNight = 3;
    room.juniorRevengeNight = null;
    room.nightVictims = [];
    room.cupidPair = [];
    room.priestChurch = [];
    room.hunterRevealId = null;
    room.players.forEach((p) => {
      if (p.role === "priest") room.priestChurch.push(p.id);
    });
    room.accusedId = null;
    room.phaseEndsAt = null;
    room.status = "playing";
    addLog(room, "Trò chơi bắt đầu. Vai đã được phân bí mật.", "phase");
    beginNight(io, room);
    callback?.({ ok: true });
    emitRoom(io, room);
  });

  socket.on("set-avatar", ({ avatarId } = {}, callback) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room && getPlayer(room, socket.data.playerId);
    const normalizedId = Number(avatarId);
    if (!room || !player || room.status !== "lobby") {
      return callback?.({ error: "Chỉ có thể đổi avatar khi game chưa bắt đầu." });
    }
    if (!isValidAvatarId(normalizedId)) {
      return callback?.({ error: "Avatar không hợp lệ." });
    }
    if (room.players.some((member) => member.id !== player.id && member.avatarId === normalizedId)) {
      return callback?.({ error: "Avatar này đã có người chọn." });
    }
    player.avatarId = normalizedId;
    callback?.({ ok: true });
    emitRoom(io, room);
  });

  socket.on("voice-signal", ({ targetId, signal } = {}, callback) => {
    const room = rooms.get(socket.data.roomCode);
    const sender = room && getPlayer(room, socket.data.playerId);
    const target = room && getPlayer(room, targetId);
    if (!room || !sender || !target || !target.socketId || !signal || !canShareVoice(room, sender, target)) {
      return callback?.({ error: "Bạn không thể dùng mic với người này lúc này." });
    }
    io.to(target.socketId).emit("voice-signal", { fromId: sender.id, signal });
    callback?.({ ok: true });
  });

  socket.on("act", ({ targets = [], mode = null }, callback) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room && getPlayer(room, socket.data.playerId);
    const action = room && actionFor(room, player);
    if (!room || !player || !action) return callback?.({ error: "Hiện tại bạn không thể thực hiện hành động này." });
    if (action.type === "verdict") {
      if (!["kill", "spare"].includes(mode)) return callback?.({ error: "Hãy chọn Giết hoặc Tha." });
      room.verdicts[player.id] = mode;
    } else if (action.allowSkip && mode === "skip") {
      if (action.type === "vote") room.votes[player.id] = null;
      else room.actions[player.id] = { targets: [], mode: "skip" };
    } else if (action.type === "witch") {
      if (!["save", "poison"].includes(mode)) return callback?.({ error: "Lựa chọn không hợp lệ." });
      const nightVictim = getPlayer(room, action.victimId);
      const firstSpringrollLife = nightVictim?.role === "springroll" && (nightVictim.health ?? 2) > 1;
      if (mode === "save" && (!room.witch.save || !action.victimId || firstSpringrollLife)) return callback?.({ error: "Không thể dùng bùa cứu lúc này." });
      if (mode === "poison" && targets[0] === player.id) return callback?.({ error: "Bạn không thể dùng bùa hại lên chính mình." });
      if (mode === "poison" && (!room.witch.poison || !validateTargets(room, player, action, targets))) return callback?.({ error: "Không thể dùng bùa hại lúc này." });
      room.actions[player.id] = { targets: mode === "save" ? [action.victimId] : targets, mode };
    } else if (!validateTargets(room, player, action, targets)) {
      return callback?.({ error: "Mục tiêu không hợp lệ." });
    } else if (action.type === "vote") {
      room.votes[player.id] = targets[0];
    } else if (action.type === "hunter") {
      killWithChains(room, [targets[0]], "bị Lọ Vương kéo theo");
      room.pendingHunter = null;
      if (checkWinner(io, room)) return callback?.({ ok: true });
      const resume = room.pendingAfterHunter;
      room.pendingAfterHunter = null;
      if (resume === "day") {
        if (!checkWinner(io, room)) startDayVote(io, room);
      } else {
        beginNight(io, room);
      }
    } else {
      room.actions[player.id] = { targets, mode: action.betrayalOnly ? "betrayal-only" : mode };
      if (action.type === "priest") {
        const already = new Set(room.priestChurch || []);
        if (targets.some((id) => already.has(id)))
          return callback?.({ error: "Người này đã ở trong Nhà Thờ." });
      }
      if (action.type === "cupid") {
        const [a, b] = targets.map((id) => getPlayer(room, id));
        a.loverId = b.id;
        b.loverId = a.id;
        room.cupidPair = [a.id, b.id];
      }
      if (action.type === "seer") {
        const target = getPlayer(room, targets[0]);
        const isEvil = ROLE_INFO[target.role].team === "demon";
        room.seerResult = {
          viewer: player.id,
          targetName: target.name,
          alignment: isEvil ? "bad" : "good"
        };
      }
    }
    callback?.({ ok: true });
    if (room.phase === "day" && Object.keys(room.votes).length >= alive(room).length) finishDayVote(io, room);
    else if (room.phase === "defense" && Object.keys(room.verdicts).length >= alive(room).length) finishDefense(io, room);
    else if (room.phase === "night") checkNightReady(io, room);
    emitRoom(io, room);
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
          emitRoom(io, room);
        }
      }, 15000);
    }
    emitRoom(io, room);
  });
});

server.on("error", (error) => {
  console.error("Không thể khởi động server:", error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Quỷ Liếm đang chạy tại http://${HOST}:${PORT}`);
});
