const { ROLE_INFO, isWolf } = require("./roles");
const { getPlayer, alive, addLog } = require("./utils");
const { emitRoom, actionFor } = require("./state");
const { schedulePhase, clearPhaseTimer } = require("./room");
const {
  pick,
  NIGHT_BEGIN,
  NIGHT_END,
  DAY_BEGIN,
  DEFENSE_BEGIN,
  VOTE_TIE,
  VOTE_BLANK,
  DEATH_DEMON,
  DEATH_HANG,
  DEATH_WITCH,
  DEATH_HUNTER,
  DEATH_LOVER,
  NIGHT_PEACEFUL,
  NIGHT_UNREST,
  WIN_VILLAGE,
  WIN_DEMON,
  WIN_LONER,
  WITCH_SAVE,
  GUARD_PROTECT,
  BISEXUAL_CONVERT,
  PRIEST_CHURCH,
  WIN_FOOL,
} = require("./narrative");

function fmt(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "???");
}

function actorsForStep(room, step) {
  const living = alive(room);
  if (step === "wolves")
    return living.filter((p) => ["demon", "junior"].includes(p.role));
  if (room.villagePowersDisabled && ["seer", "guard", "witch"].includes(step))
    return [];
  return living.filter((p) => p.role === step);
}

function hasRoleForStep(room, step) {
  if (step === "wolves")
    return room.players.some((p) => ["demon", "junior"].includes(p.role));
  return room.players.some((p) => p.role === step);
}

function buildNightSteps(room) {
  const steps =
    room.day === 1
      ? ["cupid", "priest", "wolves", "spirit", "seer", "guard", "witch"]
      : [
          "guard",
          "priest",
          "wolves",
          ...(room.day % 3 === 0 ? ["spirit"] : []),
          "seer",
          "witch",
        ];
  return steps.filter((step) => hasRoleForStep(room, step));
}

function fakeStepDuration() {
  const min = Number(process.env.NIGHT_FAKE_DURATION_MIN_MS) || 5000;
  const max = Math.max(
    min,
    Number(process.env.NIGHT_FAKE_DURATION_MAX_MS) || 12000,
  );
  return min + Math.floor(Math.random() * (max - min + 1));
}

function chooseWolfVictim(room) {
  const wolves = actorsForStep(room, "wolves");
  const counts = {};
  wolves.forEach((wolf) => {
    const action = room.actions[wolf.id];
    const target =
      action?.mode === "skip" ? null : action?.targets?.[0] || null;
    const key = target || "__skip__";
    counts[key] = (counts[key] || 0) + 1;
  });
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter((key) => counts[key] === max);
  room.nightVictim = top.length === 1 && top[0] !== "__skip__" ? top[0] : null;
  room.nightVictimReady = true;
}

function finishNightStep(io, room) {
  if (room.phase !== "night" || !room.nightStep) return;
  if (room.nightStep === "wolves") chooseWolfVictim(room);
  room.nightStepIndex += 1;
  startNightStep(io, room);
}

function startNightStep(io, room) {
  clearPhaseTimer(room);
  while (room.nightStepIndex < room.nightSteps.length) {
    room.nightStep = room.nightSteps[room.nightStepIndex];
    const actors = actorsForStep(room, room.nightStep);
    const actionDuration =
      Number(process.env.NIGHT_ACTION_DURATION_MS) || 30000;
    const duration = actors.length ? actionDuration : fakeStepDuration();
    schedulePhase(
      room,
      duration,
      () => finishNightStep(io, room),
      actionDuration,
    );
    emitRoom(io, room);
    return;
  }
  room.nightStep = null;
  resolveNight(io, room);
}

function checkNightReady(io, room) {
  if (room.phase !== "night" || !room.nightStep) return;
  const actors = actorsForStep(room, room.nightStep);
  if (!actors.length) return emitRoom(io, room);
  if (room.nightStep === "wolves") {
    if (!actors.every((p) => room.actions[p.id])) return emitRoom(io, room);
    finishNightStep(io, room);
    return;
  }
  if (actors.every((p) => room.actions[p.id])) finishNightStep(io, room);
  else emitRoom(io, room);
}

function killReason(room, id, cause) {
  const p = getPlayer(room, id);
  if (!p) return cause;
  if (cause === "trong đêm")
    return p.role === "hunter"
      ? cause
      : fmt(pick(DEATH_DEMON), { name: p.name });
  if (cause === "bị khu phố treo cổ")
    return fmt(pick(DEATH_HANG), { name: p.name });
  if (cause === "bị Lọ Vương kéo theo")
    return fmt(pick(DEATH_HUNTER), { name: p.name });
  if (cause === "bị Cậu Bé Chơi Bùa đầu độc")
    return fmt(pick(DEATH_WITCH), { name: p.name });
  if (cause === "bị Quỷ Liếm Tinh thủ tiêu")
    return `${p.name} đã bị một móng vuốt trong chính đàn Quỷ xé nát.`;
  return cause;
}

function killWithChains(room, ids, reason, hunterCanRetaliate = false) {
  const deathPhase = room.phase;
  const directVictims = new Set(ids.filter(Boolean));
  const queue = ids.filter(Boolean);
  const dead = [];
  while (queue.length) {
    const id = queue.shift();
    const player = getPlayer(room, id);
    if (!player?.alive) continue;
    if (player.role === "springroll" && (player.health ?? 2) > 1) {
      player.health = (player.health ?? 2) - 1;
      addLog(
        room,
        `${player.name} đã mất một mạng nhưng vẫn còn sống. Lớp vỏ Chá Giò đã nứt.`,
        "phase",
      );
      continue;
    }
    player.health = 0;
    player.alive = false;
    dead.push(player);
    const msg = killReason(room, id, reason);
    addLog(room, msg, "death");
    if (player.loverId && getPlayer(room, player.loverId)?.alive) {
      const lover = getPlayer(room, player.loverId);
      addLog(room, fmt(pick(DEATH_LOVER), { name: lover.name }), "death");
      queue.push(player.loverId);
    }
    if (player.role === "springroll" && !room.villagePowersDisabled) {
      room.villagePowersDisabled = true;
      room.pendingHunter = null;
      room.hunterRevealId = null;
      addLog(
        room,
        "Chá Giò đã chết hẳn. Lời nguyền khiến toàn bộ phe dân mất hết kỹ năng.",
        "phase",
      );
    }
  }
  const hunter = hunterCanRetaliate
    ? dead.find(
        (p) =>
          p.role === "hunter" &&
          directVictims.has(p.id) &&
          !room.villagePowersDisabled,
      )
    : null;
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
  room.guardLastTarget = guardTarget || null;
  const witch = alive(room).find((p) => p.role === "witch");
  const witchAction = witch ? room.actions[witch.id] : null;
  let victim = room.nightVictim;
  let saved = false;
  const victimPlayer = getPlayer(room, victim);
  const firstSpringrollLife =
    victimPlayer?.role === "springroll" && (victimPlayer.health ?? 2) > 1;
  if (victim && guardTarget === victim) {
    victim = null;
    saved = true;
    const name = getPlayer(room, guardTarget)?.name;
    addLog(room, fmt(pick(GUARD_PROTECT), { name }), "phase");
  }
  if (witchAction?.mode === "save" && victim && !firstSpringrollLife) {
    const name = getPlayer(room, victim)?.name;
    addLog(room, fmt(pick(WITCH_SAVE), { name }), "phase");
    victim = null;
    room.witch.save = false;
  }
  if (victim && victimPlayer?.role === "bisexual") {
    victimPlayer.role = "demon";
    victim = null;
    addLog(room, fmt(pick(BISEXUAL_CONVERT), { name: victimPlayer.name }), "phase");
  }
  const deaths = [];
  if (victim) deaths.push(victim);
  const spirit = alive(room).find((p) => p.role === "spirit");
  const spiritAction = spirit && room.actions[spirit.id];
  const spiritVictim =
    spiritAction?.mode === "betrayal-only"
      ? spiritAction.targets[0]
      : spiritAction?.targets[1];
  if (spiritVictim && !deaths.includes(spiritVictim)) deaths.push(spiritVictim);
  if (witchAction?.mode === "poison" && witchAction.targets[0]) {
    if (!deaths.includes(witchAction.targets[0]))
      deaths.push(witchAction.targets[0]);
    room.witch.poison = false;
  }
  const logMsg = deaths.length ? pick(NIGHT_UNREST) : pick(NIGHT_PEACEFUL);
  addLog(room, logMsg, "phase");
  const reasons = deaths.map((id) => {
    if (id === spiritVictim) return "bị Quỷ Liếm Tinh thủ tiêu";
    if (id === witchAction?.targets[0]) return "bị Cậu Bé Chơi Bùa đầu độc";
    return "trong đêm";
  });
  deaths.forEach((id, i) =>
    killWithChains(room, [id], reasons[i], id === victim),
  );
  const priest = alive(room).find((p) => p.role === "priest");
  const priestAction = priest && room.actions[priest.id];
  if (priestAction && priestAction.targets?.length) {
    priestAction.targets.forEach((tid) => {
      if (!room.priestChurch.includes(tid)) {
        room.priestChurch.push(tid);
        const name = getPlayer(room, tid)?.name;
        addLog(room, fmt(pick(PRIEST_CHURCH), { name }), "phase");
      }
    });
  }
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
    addLog(
      room,
      `${name} chính là Lọ Vương và đang chọn một người đi theo.`,
      "phase",
    );
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
  schedulePhase(room, Number(process.env.VOTE_DURATION_MS) || 180000, () =>
    finishDayVote(io, room),
  );
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
  room.nightSteps = buildNightSteps(room);
  room.nightStepIndex = 0;
  room.nightStep = null;
  room.accusedId = null;
  addLog(room, pick(NIGHT_BEGIN), "phase");
  startNightStep(io, room);
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
    addLog(
      room,
      max === 0 || blankVotes >= max ? pick(VOTE_BLANK) : pick(VOTE_TIE),
      "phase",
    );
    beginNight(io, room);
    emitRoom(io, room);
    return;
  }
  room.accusedId = top[0];
  room.phase = "defense";
  room.verdicts = {};
  const accused = getPlayer(room, room.accusedId).name;
  addLog(
    room,
    `${accused} có 30 giây phản biện. Mọi người hãy phán quyết Giết hoặc Tha.`,
    "phase",
  );
  addLog(room, pick(DEFENSE_BEGIN), "phase");
  schedulePhase(room, Number(process.env.DEFENSE_DURATION_MS) || 30000, () =>
    finishDefense(io, room),
  );
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
    addLog(
      room,
      `${name} được tha với ${spareVotes} phiếu Tha và ${killVotes} phiếu Giết.`,
      "phase",
    );
    room.accusedId = null;
    beginNight(io, room);
    emitRoom(io, room);
    return;
  }
  const accusedId = room.accusedId;
  const name = getPlayer(room, accusedId)?.name;
  addLog(
    room,
    `${name} bị kết án với ${killVotes} phiếu Giết và ${spareVotes} phiếu Tha.`,
    "phase",
  );
  room.accusedId = null;
  killWithChains(room, [accusedId], "bị khu phố treo cổ", true);
  const accused = getPlayer(room, accusedId);
  if (accused && !accused.alive && accused.role === "thangngoo") {
    room.winner = "loner";
    clearPhaseTimer(room);
    room.status = "ended";
    room.phase = "ended";
    addLog(room, pick(WIN_FOOL), "win");
    emitRoom(io, room);
    return;
  }
  if (room.phase !== "hunter") {
    if (checkWinner(io, room)) return;
    beginNight(io, room);
  }
  emitRoom(io, room);
}

function checkWinner(io, room) {
  const living = alive(room);
  const aliveIds = living.map((p) => p.id);
  const priestAlive = living.some((p) => p.role === "priest");
  if (priestAlive && room.priestChurch?.length && aliveIds.every((id) => room.priestChurch.includes(id))) {
    room.winner = "loner";
    clearPhaseTimer(room);
    room.status = "ended";
    room.phase = "ended";
    addLog(room, "Cha Sứ đã thu phục toàn bộ khu phố vào Nhà Thờ. Phe Độc Hành chiến thắng!", "win");
    emitRoom(io, room);
    return true;
  }
  const demons = living.filter((p) => ROLE_INFO[p.role]?.team === "demon");
  const villagers = living.filter((p) => ROLE_INFO[p.role]?.team === "village");
  const loners = living.filter((p) => ROLE_INFO[p.role]?.team === "loner");
  if (living.length === 1 && loners.length === 1) room.winner = "loner";
  else if (!demons.length && !loners.length) room.winner = "village";
  else if (!loners.length && demons.length >= villagers.length)
    room.winner = "demon";
  if (!room.winner) return false;
  clearPhaseTimer(room);
  room.status = "ended";
  room.phase = "ended";
  addLog(
    room,
    room.winner === "village"
      ? pick(WIN_VILLAGE)
      : room.winner === "demon"
        ? pick(WIN_DEMON)
        : pick(WIN_LONER),
    "win",
  );
  emitRoom(io, room);
  return true;
}

function validateTargets(room, player, action, targets) {
  const valid =
    Array.isArray(targets) &&
    targets.every((id) => room.players.some((p) => p.id === id && p.alive));
  if (
    !valid ||
    targets.length !== action.count ||
    new Set(targets).size !== targets.length
  )
    return false;
  if (action.exclude?.some((id) => targets.includes(id))) return false;
  if (action.betrayal) {
    if (isWolf(getPlayer(room, targets[0])?.role)) return false;
    if (targets[1] === player.id || !isWolf(getPlayer(room, targets[1])?.role))
      return false;
  } else if (action.betrayalOnly) {
    if (
      targets[0] === player.id ||
      !["demon", "junior"].includes(getPlayer(room, targets[0])?.role)
    )
      return false;
  } else if (
    action.excludeRegularWolf &&
    targets.some((id) =>
      ["demon", "junior"].includes(getPlayer(room, id)?.role),
    )
  ) {
    return false;
  } else if (
    action.excludeWolf &&
    targets.some((id) => isWolf(getPlayer(room, id)?.role))
  )
    return false;
  return true;
}

module.exports = {
  actorsForStep,
  hasRoleForStep,
  buildNightSteps,
  fakeStepDuration,
  chooseWolfVictim,
  checkNightReady,
  finishNightStep,
  killWithChains,
  resolveNight,
  beginDay,
  startDayVote,
  beginNight,
  finishDayVote,
  finishDefense,
  checkWinner,
  validateTargets,
};
