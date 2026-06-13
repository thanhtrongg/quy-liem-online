const { ROLE_INFO, isWolf } = require("./roles");
const { getPlayer, alive } = require("./utils");

function voiceChannel(room, player) {
  if (!room || !player || room.status !== "playing" || !player.alive || !player.connected) return null;
  if (["day", "defense"].includes(room.phase)) return "town";
  if (room.phase === "night" && room.nightStep === "wolves" && ["demon", "junior"].includes(player.role)) return "wolves";
  return null;
}

function canShareVoice(room, first, second) {
  const channel = voiceChannel(room, first);
  return Boolean(channel && channel === voiceChannel(room, second));
}

function actionFor(room, me) {
  if (!me || room.status !== "playing") return null;
  if (room.phase === "hunter" && room.pendingHunter === me.id && !room.villagePowersDisabled) return { type: "hunter", label: "Chọn người kéo xuống mồ", count: 1 };
  if (!me.alive) return null;
  if (room.phase === "day") return { type: "vote", label: "Bỏ phiếu treo cổ", count: 1, allowSkip: true, currentTarget: room.votes[me.id] ?? null };
  if (room.phase === "defense") return { type: "verdict", label: "Phán quyết", count: 0, currentVerdict: room.verdicts?.[me.id] || null };
  if (room.phase !== "night") return null;
  const step = room.nightStep;
  if (!step) return null;
  const acted = Boolean(room.actions[me.id]);
  if (step === "wolves" && ["demon", "junior"].includes(me.role)) {
    const currentAction = room.actions[me.id];
    return {
      type: "wolf-vote",
      label: "Đàn Quỷ chọn con mồi",
      count: 1,
      excludeRegularWolf: true,
      allowSkip: true,
      currentTarget: currentAction?.mode === "skip" ? null : currentAction?.targets?.[0] || null,
      currentSkip: currentAction?.mode === "skip"
    };
  }
  if (acted) return null;
  if (room.villagePowersDisabled && ROLE_INFO[me.role]?.team === "village") return null;
  if (step === "cupid" && me.role === "cupid") return { type: "cupid", label: "Ghép đôi hai người", count: 2 };
  if (step === "spirit" && me.role === "spirit") return room.day % 3 === 0
    ? { type: "spirit", label: "Chọn một Quỷ thường để thủ tiêu", count: 1, betrayalOnly: true }
    : { type: "acknowledge", label: "Ghi nhớ đàn Quỷ", count: 0, allowSkip: true };
  if (step === "guard" && me.role === "guard") {
    return { type: "guard", label: "Chọn người bảo kê", count: 1, exclude: room.guardLastTarget ? [room.guardLastTarget] : [] };
  }
  if (step === "seer" && me.role === "seer") return { type: "seer", label: "Chọn người để soi", count: 1 };
  if (step === "witch" && me.role === "witch") {
    const victim = getPlayer(room, room.nightVictim);
    const canSaveVictim = victim && !(victim.role === "springroll" && (victim.health ?? 2) > 1);
    return { type: "witch", label: "Dùng bùa hoặc bỏ qua", count: 1, allowSkip: true, victimId: canSaveVictim ? room.nightVictim : null };
  }
  if (step === "priest" && me.role === "priest") {
    const alreadyInChurch = new Set(room.priestChurch || []);
    const choices = alive(room).filter((p) => !alreadyInChurch.has(p.id) && p.id !== me.id);
    return {
      type: "priest",
      label: "Thêm người vào Nhà Thờ",
      count: Math.min(2, choices.length),
      allowSkip: true
    };
  }
  return null;
}

function publicState(room, socketId) {
  const me = getPlayer(room, socketId);
  const isHost = room.hostId === socketId;
  const canSeeRoles = room.status === "ended";
  const teamMates = me?.role && room.phase === "night" && room.nightStep === "wolves" && ["demon", "junior"].includes(me.role)
    ? room.players.filter((p) => p.id !== me.id && ["demon", "junior"].includes(p.role)).map((p) => p.id)
    : [];
  const spiritKnownWolves = me?.role === "spirit" && room.phase === "night" && room.nightStep === "spirit"
    ? room.players.filter((p) => ["demon", "junior"].includes(p.role)).map((p) => p.id)
    : [];
  const seerResult = room.seerResult?.viewer === socketId ? room.seerResult : null;
  const publicBallots = room.phase === "day"
    ? room.votes
    : room.phase === "night" && room.nightStep === "wolves" && ["demon", "junior"].includes(me?.role)
      ? Object.fromEntries(room.players.filter((p) => ["demon", "junior"].includes(p.role) && room.actions[p.id]).map((p) => [p.id, room.actions[p.id].mode === "skip" ? null : room.actions[p.id].targets[0]]))
      : {};
  const votesByTarget = {};
  const blankVoters = [];
  Object.entries(publicBallots).forEach(([voterId, targetId]) => {
    if (targetId) (votesByTarget[targetId] ||= []).push(voterId);
    else if (["day", "night"].includes(room.phase)) blankVoters.push(voterId);
  });
  const currentVoiceChannel = voiceChannel(room, me);
  const voicePeerIds = currentVoiceChannel
    ? room.players.filter((player) => player.id !== me.id && canShareVoice(room, me, player)).map((player) => player.id)
    : [];
  return {
    code: room.code,
    isHost,
    status: room.status,
    phase: room.phase,
    day: room.day,
    winner: room.winner,
    phaseEndsAt: room.phaseEndsAt,
    phaseStartedAt: room.phaseStartedAt,
    nightStep: room.nightStep,
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
      role: canSeeRoles || p.id === socketId || room.hunterRevealId === p.id ? p.role : null,
      isWolf: teamMates.includes(p.id) || spiritKnownWolves.includes(p.id)
    })),
    me: me ? {
      id: me.id,
      name: me.name,
      alive: me.alive,
      role: me.role,
      health: me.health,
      cupidPair: me.role === "cupid" ? room.cupidPair : [],
      priestChurch: me.role === "priest" ? room.priestChurch : [],
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
    pendingHunter: room.pendingHunter === socketId,
    villagePowersDisabled: room.villagePowersDisabled,
    voice: {
      enabled: Boolean(currentVoiceChannel),
      peerIds: voicePeerIds
    }
  };
}

function emitRoom(io, room) {
  for (const player of room.players) {
    if (player.socketId) io.to(player.socketId).emit("state", publicState(room, player.id));
  }
}

module.exports = { publicState, actionFor, emitRoom, voiceChannel, canShareVoice };
