const { ROLE_INFO } = require("./roles");
const { getPlayer, alive } = require("./utils");

function actionFor(room, me) {
  if (!me || room.status !== "playing") return null;
  if (room.phase === "hunter" && room.pendingHunter === me.id) return { type: "hunter", label: "Chọn người kéo xuống mồ", count: 1 };
  if (!me.alive) return null;
  if (room.phase === "day") return { type: "vote", label: "Bỏ phiếu treo cổ", count: 1, allowSkip: true, currentTarget: room.votes[me.id] ?? null };
  if (room.phase === "defense") return { type: "verdict", label: "Phán quyết", count: 0, currentVerdict: room.verdicts?.[me.id] || null };
  if (room.phase !== "night" || room.actions[me.id]) return null;
  if (me.role === "cupid" && room.day === 1) return { type: "cupid", label: "Ghép đôi hai người", count: 2 };
  if (me.role === "guard") return { type: "guard", label: "Chọn người bảo kê", count: 1, exclude: room.guardLast ? [room.guardLast] : [] };
  if (me.role === "seer") return { type: "seer", label: "Chọn người để soi", count: 1 };
  if (me.role === "witch" && room.nightVictimReady) return { type: "witch", label: "Dùng bùa hoặc bỏ qua", count: 1, allowSkip: true, victimId: room.nightVictim };
  if (me.role === "demon") return { type: "demon", label: "Chọn người để liếm", count: 1, excludeTeam: true };
  if (me.role === "junior" && !alive(room).some((p) => p.role === "demon")) return { type: "junior", label: "Chọn người để liếm", count: 1, excludeTeam: true };
  return null;
}

function publicState(room, socketId) {
  const me = getPlayer(room, socketId);
  const isHost = room.hostId === socketId;
  const canSeeRoles = room.status === "ended";
  const teamMates = me?.role && ROLE_INFO[me.role]?.team === "demon"
    ? room.players.filter((p) => p.id !== me.id && p.role && ROLE_INFO[p.role]?.team === "demon").map((p) => p.id)
    : [];
  const seerResult = room.seerResult?.viewer === socketId ? room.seerResult : null;
  const publicBallots = room.phase === "day" ? room.votes : {};
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
    phaseStartedAt: room.phaseStartedAt,
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
      description: me.role ? ROLE_INFO[me.role].description : null,
      flavor: me.role ? ROLE_INFO[me.role].flavor : null
    } : null,
    votesByTarget,
    blankVoters,
    verdicts: {
      kill: Object.values(room.verdicts || {}).filter((verdict) => verdict === "kill").length,
      spare: Object.values(room.verdicts || {}).filter((verdict) => verdict === "spare").length,
      voted: Object.keys(room.verdicts || {}).length
    },
    action: actionFor(room, me),
    seerResult,
    logs: room.logs.slice(-30),
    witch: me?.role === "witch" ? room.witch : null,
    pendingHunter: room.pendingHunter === socketId
  };
}

function emitRoom(io, room) {
  for (const player of room.players) {
    if (player.socketId) io.to(player.socketId).emit("state", publicState(room, player.id));
  }
}

module.exports = { publicState, actionFor, emitRoom };
