const { ROLE_INFO } = require("./roles");
const { getPlayer, alive, addLog } = require("./utils");
const { emitRoom, actionFor } = require("./state");
const { schedulePhase, clearPhaseTimer } = require("./room");
const { pick,
  NIGHT_BEGIN, NIGHT_END, DAY_BEGIN, DEFENSE_BEGIN,
  VOTE_TIE, VOTE_BLANK,
  DEATH_DEMON, DEATH_HANG, DEATH_WITCH, DEATH_HUNTER, DEATH_LOVER,
  NIGHT_PEACEFUL, NIGHT_UNREST,
  WIN_VILLAGE, WIN_DEMON,
  WITCH_SAVE, GUARD_PROTECT
} = require("./narrative");

function fmt(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "???");
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

function checkNightReady(io, room) {
  setNightVictimIfReady(room);
  const required = requiredNightActors(room);
  const baseReady = required.every((p) => room.actions[p.id]);
  if (!baseReady) return;
  setNightVictimIfReady(room);
  const witch = alive(room).find((p) => p.role === "witch");
  if (witch && !room.actions[witch.id]) {
    emitRoom(io, room);
    return;
  }
  resolveNight(io, room);
}

function killReason(room, id, cause) {
  const p = getPlayer(room, id);
  if (!p) return cause;
  if (cause === "trong đêm") return p.role === "hunter" ? cause : fmt(pick(DEATH_DEMON), { name: p.name });
  if (cause === "bị khu phố treo cổ") return fmt(pick(DEATH_HANG), { name: p.name });
  if (cause === "bị Lọ Vương kéo theo") return fmt(pick(DEATH_HUNTER), { name: p.name });
  if (cause === "bị phù thủy đầu độc") return fmt(pick(DEATH_WITCH), { name: p.name });
  return cause;
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
    const msg = killReason(room, id, reason);
    addLog(room, msg, "death");
    if (player.loverId && getPlayer(room, player.loverId)?.alive) {
      const lover = getPlayer(room, player.loverId);
      addLog(room, fmt(pick(DEATH_LOVER), { name: lover.name }), "death");
      queue.push(player.loverId);
    }
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

function resolveNight(io, room) {
  const guard = alive(room).find((p) => p.role === "guard");
  const guardTarget = guard ? room.actions[guard.id]?.targets[0] : null;
  room.guardLast = guardTarget || null;
  const witch = alive(room).find((p) => p.role === "witch");
  const witchAction = witch ? room.actions[witch.id] : null;
  let victim = room.nightVictim;
  let saved = false;
  if (victim && guardTarget === victim) {
    victim = null;
    saved = true;
    const name = getPlayer(room, guardTarget)?.name;
    addLog(room, fmt(pick(GUARD_PROTECT), { name }), "phase");
  }
  if (witchAction?.mode === "save" && victim) {
    const name = getPlayer(room, victim)?.name;
    addLog(room, fmt(pick(WITCH_SAVE), { name }), "phase");
    victim = null;
    room.witch.save = false;
  }
  const deaths = [];
  if (victim) deaths.push(victim);
  if (witchAction?.mode === "poison" && witchAction.targets[0]) {
    deaths.push(witchAction.targets[0]);
    room.witch.poison = false;
  }
  const logMsg = deaths.length ? pick(NIGHT_UNREST) : pick(NIGHT_PEACEFUL);
  addLog(room, logMsg, "phase");
  const reasons = deaths.map((id) => id === witchAction?.targets[0] ? "bị phù thủy đầu độc" : "trong đêm");
  deaths.forEach((id, i) => killWithChains(room, [id], reasons[i]));
  if (room.pendingHunter) beginDay(io, room, true);
  else if (!checkWinner(io, room)) beginDay(io, room);
  emitRoom(io, room);
}

function beginDay(io, room, waitForHunter = false) {
  if (!waitForHunter && checkWinner(io, room)) return false;
  room.phase = "day";
  room.votes = {};
  room.actions = {};
  room.accusedId = null;
  room.nightVictim = null;
  room.nightVictimReady = false;
  addLog(room, pick(NIGHT_END), "phase");
  if (waitForHunter) {
    room.pendingAfterHunter = "day";
    room.phase = "hunter";
    const name = getPlayer(room, room.pendingHunter)?.name;
    addLog(room, `${name} chính là Lọ Vương và đang chọn một người đi theo.`, "phase");
  } else {
    startDayVote(io, room);
  }
  return true;
}

function startDayVote(io, room) {
  room.phase = "day";
  room.votes = {};
  room.verdicts = {};
  room.actions = {};
  room.accusedId = null;
  addLog(room, pick(DAY_BEGIN), "phase");
  schedulePhase(room, Number(process.env.VOTE_DURATION_MS) || 180000, () => finishDayVote(io, room));
  emitRoom(io, room);
}

function beginNight(io, room) {
  clearPhaseTimer(room);
  if (checkWinner(io, room)) return false;
  room.day += 1;
  room.phase = "night";
  room.actions = {};
  room.votes = {};
  room.verdicts = {};
  room.nightVictim = null;
  room.nightVictimReady = false;
  room.accusedId = null;
  addLog(room, pick(NIGHT_BEGIN), "phase");
  setTimeout(() => {
    if (room.phase === "night") checkNightReady(io, room);
  }, 100);
  return true;
}

function finishDayVote(io, room) {
  if (room.phase !== "day") return;
  clearPhaseTimer(room);
  const counts = {};
  let blankVotes = 0;
  Object.values(room.votes).forEach((target) => {
    if (target) counts[target] = (counts[target] || 0) + 1;
    else blankVotes++;
  });
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((id) => counts[id] === max);
  if (max === 0 || top.length !== 1 || blankVotes >= max) {
    addLog(room, max === 0 || blankVotes >= max ? pick(VOTE_BLANK) : pick(VOTE_TIE), "phase");
    beginNight(io, room);
    emitRoom(io, room);
    return;
  }
  room.accusedId = top[0];
  room.phase = "defense";
  room.verdicts = {};
  const accused = getPlayer(room, room.accusedId).name;
  addLog(room, `${accused} có 30 giây phản biện. Mọi người hãy phán quyết Giết hoặc Tha.`, "phase");
  addLog(room, pick(DEFENSE_BEGIN), "phase");
  schedulePhase(room, Number(process.env.DEFENSE_DURATION_MS) || 30000, () => finishDefense(io, room));
  emitRoom(io, room);
}

function finishDefense(io, room) {
  if (room.phase !== "defense") return;
  clearPhaseTimer(room);
  const verdicts = Object.values(room.verdicts || {});
  const killVotes = verdicts.filter((verdict) => verdict === "kill").length;
  const spareVotes = verdicts.filter((verdict) => verdict === "spare").length;
  if (spareVotes > killVotes) {
    const name = getPlayer(room, room.accusedId)?.name;
    addLog(room, `${name} được tha với ${spareVotes} phiếu Tha và ${killVotes} phiếu Giết.`, "phase");
    room.accusedId = null;
    beginNight(io, room);
    emitRoom(io, room);
    return;
  }
  const accusedId = room.accusedId;
  const name = getPlayer(room, accusedId)?.name;
  addLog(room, `${name} bị kết án với ${killVotes} phiếu Giết và ${spareVotes} phiếu Tha.`, "phase");
  room.accusedId = null;
  killWithChains(room, [accusedId], "bị khu phố treo cổ");
  if (room.phase !== "hunter") {
    if (checkWinner(io, room)) return;
    beginNight(io, room);
  }
  emitRoom(io, room);
}

function checkWinner(io, room) {
  const living = alive(room);
  const demons = living.filter((p) => ROLE_INFO[p.role]?.team === "demon");
  const villagers = living.filter((p) => ROLE_INFO[p.role]?.team === "village");
  if (!demons.length) room.winner = "village";
  else if (demons.length >= villagers.length) room.winner = "demon";
  if (!room.winner) return false;
  clearPhaseTimer(room);
  room.status = "ended";
  room.phase = "ended";
  addLog(room, room.winner === "village" ? pick(WIN_VILLAGE) : pick(WIN_DEMON), "win");
  emitRoom(io, room);
  return true;
}

function validateTargets(room, player, action, targets) {
  const valid = Array.isArray(targets) && targets.every((id) => room.players.some((p) => p.id === id && p.alive));
  if (!valid || targets.length !== action.count || new Set(targets).size !== targets.length) return false;
  if (action.exclude?.some((id) => targets.includes(id))) return false;
  if (action.excludeTeam && targets.some((id) => ROLE_INFO[getPlayer(room, id)?.role]?.team === "demon")) return false;
  return true;
}

module.exports = {
  requiredNightActors,
  setNightVictimIfReady,
  checkNightReady,
  killWithChains,
  resolveNight,
  beginDay,
  startDayVote,
  beginNight,
  finishDayVote,
  finishDefense,
  checkWinner,
  validateTargets
};
