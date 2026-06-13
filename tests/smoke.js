const { spawn } = require("child_process");
const { io } = require("socket.io-client");
const assert = require("assert");
const { killWithChains, buildNightSteps, chooseWolfVictim, actorsForStep } = require("../game/engine");
const { actionFor } = require("../game/state");

const port = 3200 + Math.floor(Math.random() * 700);
const origin = `http://localhost:${port}`;
const latest = new WeakMap();
let openClients = [];
const server = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), VOTE_DURATION_MS: "1000", DEFENSE_DURATION_MS: "160", NIGHT_ACTION_DURATION_MS: "160", NIGHT_FAKE_DURATION_MIN_MS: "60", NIGHT_FAKE_DURATION_MAX_MS: "90" },
  stdio: ["ignore", "pipe", "pipe"]
});
const serverReady = new Promise((resolve, reject) => {
  server.stdout.once("data", resolve);
  server.stderr.once("data", (data) => reject(new Error(data.toString())));
  server.once("exit", (code) => reject(new Error(`Server exited early with code ${code}`)));
});

const emit = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const once = (socket, event, timeout = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timeout waiting for event: ${event}`)), timeout);
  socket.once(event, (payload) => {
    clearTimeout(timer);
    resolve(payload);
  });
});
const nextState = (socket, predicate, timeout = 3000) => new Promise((resolve, reject) => {
  if (latest.has(socket) && predicate(latest.get(socket))) return resolve(latest.get(socket));
  const timer = setTimeout(() => reject(new Error(`Timeout waiting for state: ${predicate}`)), timeout);
  const handler = (state) => {
    if (!predicate(state)) return;
    clearTimeout(timer);
    socket.off("state", handler);
    resolve(state);
  };
  socket.on("state", handler);
});

async function connect() {
  const socket = io(origin, { transports: ["websocket"], forceNew: true, reconnection: false });
  openClients.push(socket);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

async function createGroup(prefix, roles) {
  const clients = await Promise.all([connect(), connect(), connect(), connect()]);
  clients.forEach((client, index) => client.on("state", (state) => {
    latest.set(client, state);
    if (process.env.DEBUG_SMOKE) console.log(prefix, index, state.phase, state.me?.role, state.me?.alive);
  }));
  const created = await emit(clients[0], "create-room", { name: `${prefix} Host` });
  assert(created.ok);
  for (let index = 1; index < clients.length; index += 1) {
    assert((await emit(clients[index], "join-room", { name: `${prefix} ${index}`, code: created.code })).ok);
  }
  clients[0].emit("set-roles", roles);
  assert((await emit(clients[0], "start-game", {})).ok);
  return clients;
}

function testHunterDeathRules() {
  const makeRoom = (phase, players) => ({
    phase,
    players,
    logs: [],
    villagePowersDisabled: false,
    pendingHunter: null,
    hunterRevealId: null,
    pendingAfterHunter: null
  });
  const player = (id, role, loverId = null) => ({ id, name: id, role, loverId, alive: true, health: role === "springroll" ? 2 : 1 });

  const demonVictim = makeRoom("night", [player("hunter", "hunter"), player("other", "villager")]);
  killWithChains(demonVictim, ["hunter"], "trong đêm", true);
  assert.equal(demonVictim.pendingHunter, "hunter");

  const hanged = makeRoom("defense", [player("hunter", "hunter"), player("other", "villager")]);
  killWithChains(hanged, ["hunter"], "bị khu phố treo cổ", true);
  assert.equal(hanged.pendingHunter, "hunter");

  const poisoned = makeRoom("night", [player("hunter", "hunter"), player("other", "villager")]);
  killWithChains(poisoned, ["hunter"], "bị phù thủy đầu độc");
  assert.equal(poisoned.pendingHunter, null);

  const loverDeath = makeRoom("night", [
    player("victim", "villager", "hunter"),
    player("hunter", "hunter", "victim")
  ]);
  killWithChains(loverDeath, ["victim"], "trong đêm", true);
  assert.equal(loverDeath.pendingHunter, null);
  assert.equal(loverDeath.players.find((entry) => entry.id === "hunter").alive, false);

  const finalDuel = makeRoom("night", [player("demon", "demon"), player("spirit", "spirit")]);
  finalDuel.status = "playing";
  finalDuel.actions = {};
  finalDuel.day = 1;
  finalDuel.nightStep = "wolves";
  assert.equal(actionFor(finalDuel, finalDuel.players[0]).type, "wolf-vote");
  assert.equal(actionFor(finalDuel, finalDuel.players[1]), null);
  finalDuel.day = 3;
  finalDuel.nightStep = "spirit";
  assert.equal(actionFor(finalDuel, finalDuel.players[1]).betrayalOnly, true);

  const springrollRoom = makeRoom("night", [player("springroll", "springroll"), player("seer", "seer")]);
  killWithChains(springrollRoom, ["springroll"], "trong đêm", true);
  assert.equal(springrollRoom.players[0].alive, true);
  assert.equal(springrollRoom.players[0].health, 1);
  assert.equal(springrollRoom.villagePowersDisabled, false);
  killWithChains(springrollRoom, ["springroll"], "trong đêm", true);
  assert.equal(springrollRoom.players[0].alive, false);
  assert.equal(springrollRoom.villagePowersDisabled, true);
  springrollRoom.status = "playing";
  springrollRoom.actions = {};
  springrollRoom.day = 1;
  springrollRoom.nightStep = "seer";
  assert.equal(actionFor(springrollRoom, springrollRoom.players[1]), null);

  const guardRoom = makeRoom("night", [player("guard", "guard"), player("other", "villager")]);
  guardRoom.status = "playing";
  guardRoom.actions = {};
  guardRoom.day = 1;
  guardRoom.nightStep = "guard";
  guardRoom.guardLastTarget = null;
  assert.deepEqual(actionFor(guardRoom, guardRoom.players[0]).exclude, []);
  guardRoom.day = 2;
  guardRoom.guardLastTarget = "other";
  assert.deepEqual(actionFor(guardRoom, guardRoom.players[0]).exclude, ["other"]);
  guardRoom.guardLastTarget = "guard";
  guardRoom.day = 3;
  assert.deepEqual(actionFor(guardRoom, guardRoom.players[0]).exclude, ["guard"]);

  const witchSpringrollRoom = makeRoom("night", [player("witch", "witch"), player("springroll", "springroll")]);
  witchSpringrollRoom.status = "playing";
  witchSpringrollRoom.actions = {};
  witchSpringrollRoom.day = 1;
  witchSpringrollRoom.nightStep = "witch";
  witchSpringrollRoom.nightVictimReady = true;
  witchSpringrollRoom.nightVictim = "springroll";
  assert.equal(actionFor(witchSpringrollRoom, witchSpringrollRoom.players[0]).victimId, null);
  witchSpringrollRoom.players[1].health = 1;
  assert.equal(actionFor(witchSpringrollRoom, witchSpringrollRoom.players[0]).victimId, "springroll");

  const orderedNight = makeRoom("night", [
    player("cupid", "cupid"),
    player("demon", "demon"),
    player("junior", "junior"),
    player("spirit", "spirit"),
    player("seer", "seer"),
    player("guard", "guard"),
    player("witch", "witch")
  ]);
  orderedNight.day = 1;
  orderedNight.villagePowersDisabled = false;
  assert.deepEqual(buildNightSteps(orderedNight), ["cupid", "wolves", "spirit", "seer", "guard", "witch"]);
  orderedNight.day = 2;
  assert.deepEqual(buildNightSteps(orderedNight), ["guard", "wolves", "seer", "witch"]);
  orderedNight.day = 3;
  assert.deepEqual(buildNightSteps(orderedNight), ["guard", "wolves", "spirit", "seer", "witch"]);
  orderedNight.players.find((entry) => entry.role === "seer").alive = false;
  assert(buildNightSteps(orderedNight).includes("seer"));
  assert.equal(actorsForStep(orderedNight, "seer").length, 0);

  const majorityRoom = makeRoom("night", [
    player("wolf-a", "demon"),
    player("wolf-b", "junior"),
    player("wolf-c", "demon"),
    player("victim-a", "villager"),
    player("victim-b", "villager")
  ]);
  majorityRoom.actions = {
    "wolf-a": { targets: ["victim-a"], mode: null },
    "wolf-b": { targets: ["victim-a"], mode: null },
    "wolf-c": { targets: ["victim-b"], mode: null }
  };
  chooseWolfVictim(majorityRoom);
  assert.equal(majorityRoom.nightVictim, "victim-a");
  majorityRoom.actions["wolf-b"] = { targets: [], mode: "skip" };
  majorityRoom.actions["wolf-c"] = { targets: [], mode: "skip" };
  chooseWolfVictim(majorityRoom);
  assert.equal(majorityRoom.nightVictim, null);
}

async function run() {
  testHunterDeathRules();
  await serverReady;
  const managed = await Promise.all([connect(), connect(), connect()]);
  managed.forEach((client) => client.on("state", (state) => latest.set(client, state)));
  const managedRoom = await emit(managed[0], "create-room", { name: "Manager" });
  assert((await emit(managed[1], "join-room", { name: "Kick Me", code: managedRoom.code })).ok);
  assert((await emit(managed[2], "join-room", { name: "Stay", code: managedRoom.code })).ok);
  const managedState = await nextState(managed[0], (state) => state.players.length === 3);
  const kickTarget = managedState.players.find((player) => player.name === "Kick Me");
  assert((await emit(managed[2], "kick-player", { playerId: kickTarget.id })).error);
  const kicked = once(managed[1], "room-closed");
  assert((await emit(managed[0], "kick-player", { playerId: kickTarget.id })).ok);
  assert((await kicked).reason.includes("kick"));
  assert((await emit(managed[2], "cancel-room", {})).error);
  assert((await emit(managed[0], "leave-room", {})).error);
  const closedHost = once(managed[0], "room-closed");
  const closedMember = once(managed[2], "room-closed");
  assert((await emit(managed[0], "cancel-room", {})).ok);
  assert((await closedHost).reason.includes("hủy phòng"));
  assert((await closedMember).reason.includes("hủy phòng"));
  managed.forEach((client) => client.disconnect());

  const leaving = await Promise.all([connect(), connect()]);
  leaving.forEach((client) => client.on("state", (state) => latest.set(client, state)));
  const leavingRoom = await emit(leaving[0], "create-room", { name: "Leave Host" });
  assert((await emit(leaving[1], "join-room", { name: "Leaver", code: leavingRoom.code })).ok);
  await nextState(leaving[0], (state) => state.players.length === 2);
  const leftEvent = once(leaving[1], "room-closed");
  const hostAlone = nextState(leaving[0], (state) => state.players.length === 1);
  assert((await emit(leaving[1], "leave-room", {})).ok);
  assert((await leftEvent).reason.includes("rời phòng"));
  await hostAlone;
  leaving.forEach((client) => client.disconnect());

  const clients = await createGroup("Basic", { demon: 1, seer: 0, witch: 0, guard: 0, villager: 3, hunter: 0, cupid: 0, junior: 0 });
  const nightStates = await Promise.all(clients.map((client) => nextState(client, (state) => state.phase === "night")));
  const demonIndex = nightStates.findIndex((state) => state.me.role === "demon");
  assert(demonIndex >= 0);
  const target = nightStates[demonIndex].players.find((p) => p.id !== nightStates[demonIndex].me.id);
  const dayPromise = clients.map((client) => nextState(client, (state) => state.phase === "day" || state.phase === "ended"));
  assert((await emit(clients[demonIndex], "act", { targets: [target.id], mode: null })).ok);
  const dayStates = await Promise.all(dayPromise);
  assert(dayStates.every((state) => state.phase === "day"));

  const living = dayStates.map((state, index) => ({ state, index })).filter(({ state }) => state.me.alive);
  const nextNight = nextState(clients[living[0].index], (state) => state.phase === "night");
  for (const { index } of living) assert((await emit(clients[index], "act", { targets: [], mode: "skip" })).ok);
  assert.equal((await nextNight).day, 2);

  clients.forEach((client) => client.disconnect());

  const witchClients = await createGroup("Witch", { demon: 1, seer: 0, witch: 1, guard: 0, villager: 2, hunter: 0, cupid: 0, junior: 0 });
  const witchNight = await Promise.all(witchClients.map((client) => nextState(client, (state) => state.phase === "night")));
  const witchDemonIndex = witchNight.findIndex((state) => state.me.role === "demon");
  const witchIndex = witchNight.findIndex((state) => state.me.role === "witch");
  const victim = witchNight[witchDemonIndex].players.find((p) => p.id !== witchNight[witchDemonIndex].me.id);
  assert.equal(witchNight[witchIndex].action, null);
  const saveAvailable = nextState(witchClients[witchIndex], (state) => state.action?.type === "witch" && state.action.victimId === victim.id);
  assert((await emit(witchClients[witchDemonIndex], "act", { targets: [victim.id], mode: null })).ok);
  await saveAvailable;
  assert((await emit(witchClients[witchIndex], "act", { targets: [witchNight[witchIndex].me.id], mode: "poison" })).error);
  const savedDay = witchClients.map((client) => nextState(client, (state) => state.phase === "day"));
  assert((await emit(witchClients[witchIndex], "act", { targets: [], mode: "save" })).ok);
  assert((await Promise.all(savedDay)).every((state) => state.players.every((player) => player.alive)));
  witchClients.forEach((client) => client.disconnect());

  const guardedSpringrollClients = await createGroup("Guarded Springroll", { demon: 1, seer: 0, witch: 0, guard: 1, villager: 1, springroll: 1, hunter: 0, cupid: 0, junior: 0 });
  const guardedSpringrollNight = await Promise.all(guardedSpringrollClients.map((client) => nextState(client, (state) => state.phase === "night")));
  const guardedDemonIndex = guardedSpringrollNight.findIndex((state) => state.me.role === "demon");
  const guardIndex = guardedSpringrollNight.findIndex((state) => state.me.role === "guard");
  const springrollIndex = guardedSpringrollNight.findIndex((state) => state.me.role === "springroll");
  const springrollId = guardedSpringrollNight[springrollIndex].me.id;
  const guardedSpringrollDay = guardedSpringrollClients.map((client) => nextState(client, (state) => state.phase === "day"));
  assert((await emit(guardedSpringrollClients[guardedDemonIndex], "act", { targets: [springrollId], mode: null })).ok);
  await nextState(guardedSpringrollClients[guardIndex], (state) => state.action?.type === "guard");
  assert((await emit(guardedSpringrollClients[guardIndex], "act", { targets: [springrollId], mode: null })).ok);
  const guardedSpringrollDayStates = await Promise.all(guardedSpringrollDay);
  assert.equal(guardedSpringrollDayStates[springrollIndex].me.health, 2);
  guardedSpringrollClients.forEach((client) => client.disconnect());

  const seerClients = await createGroup("Seer", { demon: 1, seer: 1, witch: 0, guard: 0, villager: 2, hunter: 0, cupid: 0, junior: 0 });
  const seerNight = await Promise.all(seerClients.map((client) => nextState(client, (state) => state.phase === "night")));
  const seerIndex = seerNight.findIndex((state) => state.me.role === "seer");
  const seenDemon = seerNight.find((state) => state.me.role === "demon").me.id;
  const alignmentResult = nextState(seerClients[seerIndex], (state) => state.seerResult?.targetName);
  await nextState(seerClients[seerIndex], (state) => state.action?.type === "seer");
  assert((await emit(seerClients[seerIndex], "act", { targets: [seenDemon], mode: null })).ok);
  const seerState = await alignmentResult;
  assert.equal(seerState.seerResult.alignment, "bad");
  assert.equal(seerState.seerResult.isDemon, undefined);
  assert.equal(seerState.seerResult.role, undefined);
  seerClients.forEach((client) => client.disconnect());

  const equalClients = await createGroup("Equal", { demon: 2, seer: 0, witch: 0, guard: 0, villager: 2, hunter: 0, cupid: 0, junior: 0 });
  const ended = await Promise.all(equalClients.map((client) => nextState(client, (state) => state.phase === "ended")));
  assert(ended.every((state) => state.winner === "demon"));
  assert((await emit(equalClients[1], "replay-room", {})).error);
  const replayLobby = equalClients.map((client) => nextState(client, (state) => state.phase === "lobby"));
  assert((await emit(equalClients[0], "replay-room", {})).ok);
  const replayStates = await Promise.all(replayLobby);
  assert(replayStates.every((state) => state.players.every((player) => player.alive && player.role === null)));
  equalClients.forEach((client) => client.disconnect());

  const spiritClients = await createGroup("Spirit", { demon: 1, spirit: 1, seer: 0, witch: 0, guard: 0, villager: 2, hunter: 0, cupid: 0, junior: 0 });
  const spiritFirstNight = await Promise.all(spiritClients.map((client) => nextState(client, (state) => state.phase === "night")));
  const spiritIndex = spiritFirstNight.findIndex((state) => state.me.role === "spirit");
  const spiritDemonIndex = spiritFirstNight.findIndex((state) => state.me.role === "demon");
  const firstSpiritVictim = spiritFirstNight.find((state) => state.me.role === "villager").me;
  assert.equal(spiritFirstNight[spiritIndex].action, null);
  const maskedSpirit = spiritFirstNight[spiritDemonIndex].players.find((player) => player.id === spiritFirstNight[spiritIndex].me.id);
  assert.equal(maskedSpirit.role, null);
  assert.equal(maskedSpirit.isWolf, false);
  const spiritFirstDay = spiritClients.map((client) => nextState(client, (state) => state.phase === "day"));
  assert((await emit(spiritClients[spiritDemonIndex], "act", { targets: [firstSpiritVictim.id], mode: null })).ok);
  const spiritReveal = await nextState(spiritClients[spiritIndex], (state) => state.nightStep === "spirit" && state.action?.type === "acknowledge");
  const revealedDemon = spiritReveal.players.find((player) => player.id === spiritFirstNight[spiritDemonIndex].me.id);
  assert.equal(revealedDemon.role, null);
  assert.equal(revealedDemon.isWolf, true);
  assert((await emit(spiritClients[spiritIndex], "act", { targets: [], mode: "skip" })).ok);
  const spiritFirstDayStates = await Promise.all(spiritFirstDay);
  const spiritLiving = spiritFirstDayStates.map((state, index) => ({ state, index })).filter(({ state }) => state.me.alive);
  const spiritSecondNight = spiritClients.map((client) => nextState(client, (state) => state.phase === "night" && state.day === 2));
  for (const { index } of spiritLiving) assert((await emit(spiritClients[index], "act", { targets: [], mode: "skip" })).ok);
  const spiritSecondNightStates = await Promise.all(spiritSecondNight);
  const secondSpiritState = spiritSecondNightStates[spiritIndex];
  const secondSpiritVictim = spiritSecondNightStates.find((state) => state.me.alive && state.me.role === "villager").me;
  const spiritDemonId = spiritSecondNightStates[spiritDemonIndex].me.id;
  assert.equal(secondSpiritState.action, null);
  const spiritSecondDay = spiritClients.map((client) => nextState(client, (state) => state.phase === "day" && state.day === 2));
  assert((await emit(spiritClients[spiritDemonIndex], "act", { targets: [secondSpiritVictim.id], mode: null })).ok);
  const spiritSecondDayStates = await Promise.all(spiritSecondDay);
  const spiritDuelists = spiritSecondDayStates.map((state, index) => ({ state, index })).filter(({ state }) => state.me.alive);
  const spiritThirdNight = nextState(spiritClients[spiritIndex], (state) => state.nightStep === "spirit" && state.day === 3);
  for (const { index } of spiritDuelists) assert((await emit(spiritClients[index], "act", { targets: [], mode: "skip" })).ok);
  await nextState(spiritClients[spiritDemonIndex], (state) => state.nightStep === "wolves" && state.action?.type === "wolf-vote");
  assert((await emit(spiritClients[spiritDemonIndex], "act", { targets: [], mode: "skip" })).ok);
  const thirdSpiritState = await spiritThirdNight;
  assert.equal(thirdSpiritState.action.betrayalOnly, true);
  const lonerWin = spiritClients.map((client) => nextState(client, (state) => state.phase === "ended"));
  assert((await emit(spiritClients[spiritIndex], "act", { targets: [spiritDemonId], mode: null })).ok);
  assert((await Promise.all(lonerWin)).every((state) => state.winner === "loner"));
  spiritClients.forEach((client) => client.disconnect());

  const cupidClients = await createGroup("Cupid", { demon: 1, seer: 0, witch: 0, guard: 0, villager: 2, hunter: 0, cupid: 1, junior: 0 });
  const cupidNight = await Promise.all(cupidClients.map((client) => nextState(client, (state) => state.phase === "night")));
  const cupidIndex = cupidNight.findIndex((state) => state.me.role === "cupid");
  const cupidDemonIndex = cupidNight.findIndex((state) => state.me.role === "demon");
  assert.equal(cupidNight[cupidIndex].roleInfo.cupid.team, "loner");
  const cupidSelf = cupidNight[cupidIndex].me.id;
  const cupidPartner = cupidNight[cupidIndex].players.find((player) => player.id !== cupidSelf && player.id !== cupidNight[cupidDemonIndex].me.id);
  const pairVisible = nextState(cupidClients[cupidIndex], (state) => state.me.cupidPair?.length === 2);
  assert((await emit(cupidClients[cupidIndex], "act", { targets: [cupidSelf, cupidPartner.id], mode: null })).ok);
  assert.deepEqual((await pairVisible).me.cupidPair, [cupidSelf, cupidPartner.id]);
  const partnerIndex = cupidNight.findIndex((state) => state.me.id === cupidPartner.id);
  const partnerState = await nextState(cupidClients[partnerIndex], (state) => state.phase === "night");
  assert.equal(partnerState.me.loverId, undefined);
  assert.equal(partnerState.me.cupidPair.length, 0);
  assert(partnerState.players.every((player) => player.lover === undefined));
  const cupidDay = cupidClients.map((client) => nextState(client, (state) => state.phase === "day"));
  const demonTarget = cupidNight[cupidDemonIndex].players.find((player) => player.id !== cupidSelf && player.id !== cupidPartner.id && player.id !== cupidNight[cupidDemonIndex].me.id);
  assert((await emit(cupidClients[cupidDemonIndex], "act", { targets: [demonTarget.id], mode: null })).ok);
  const cupidDayStates = await Promise.all(cupidDay);
  const cupidLiving = cupidDayStates.map((state, index) => ({ state, index })).filter(({ state }) => state.me.alive);
  const cupidSecondNight = nextState(cupidClients[cupidIndex], (state) => state.phase === "night" && state.day === 2);
  for (const { index } of cupidLiving) assert((await emit(cupidClients[index], "act", { targets: [], mode: "skip" })).ok);
  assert.equal((await cupidSecondNight).action, null);
  cupidClients.forEach((client) => client.disconnect());

  const hunterClients = await createGroup("Hunter", { demon: 1, seer: 0, witch: 0, guard: 0, villager: 2, hunter: 1, cupid: 0, junior: 0 });
  const hunterNight = await Promise.all(hunterClients.map((client) => nextState(client, (state) => state.phase === "night")));
  const hunterDemonIndex = hunterNight.findIndex((state) => state.me.role === "demon");
  const hunterIndex = hunterNight.findIndex((state) => state.me.role === "hunter");
  const hunterId = hunterNight[hunterIndex].me.id;
  const hunterChoice = nextState(hunterClients[hunterIndex], (state) => state.phase === "hunter" && state.action?.type === "hunter");
  assert((await emit(hunterClients[hunterDemonIndex], "act", { targets: [hunterId], mode: null })).ok);
  const hunterState = await hunterChoice;
  assert.equal(hunterState.day, 1);
  assert.equal(hunterState.me.alive, false);
  assert.equal(hunterState.hunterRevealName, hunterState.me.name);
  const hunterTarget = hunterState.players.find((player) => player.alive && player.id !== hunterId);
  const afterHunter = nextState(hunterClients[hunterIndex], (state) => state.phase === "day" || state.phase === "ended");
  assert((await emit(hunterClients[hunterIndex], "act", { targets: [hunterTarget.id], mode: null })).ok);
  const afterHunterState = await afterHunter;
  if (afterHunterState.phase === "day") assert(afterHunterState.phaseEndsAt > Date.now());
  hunterClients.forEach((client) => client.disconnect());

  const defenseClients = await createGroup("Defense", { demon: 1, seer: 0, witch: 0, guard: 0, villager: 3, hunter: 0, cupid: 0, junior: 0 });
  const defenseNight = await Promise.all(defenseClients.map((client) => nextState(client, (state) => state.phase === "night")));
  const defenseDemonIndex = defenseNight.findIndex((state) => state.me.role === "demon");
  const firstVictim = defenseNight[defenseDemonIndex].players.find((player) => player.id !== defenseNight[defenseDemonIndex].me.id);
  const defenseDay = defenseClients.map((client) => nextState(client, (state) => state.phase === "day"));
  assert((await emit(defenseClients[defenseDemonIndex], "act", { targets: [firstVictim.id], mode: null })).ok);
  const defenseDayStates = await Promise.all(defenseDay);
  const defenseLiving = defenseDayStates.map((state, index) => ({ state, index })).filter(({ state }) => state.me.alive);
  const accused = defenseLiving[0].state.me.id;
  const defensePhase = nextState(defenseClients[defenseLiving[0].index], (state) => state.phase === "defense");
  const allVotesStartedAt = Date.now();
  for (const { index } of defenseLiving) assert((await emit(defenseClients[index], "act", { targets: [accused], mode: null })).ok);
  const defenseState = await defensePhase;
  assert(Date.now() - allVotesStartedAt < 700);
  assert.equal(defenseState.action.type, "verdict");
  const survivedToNight = nextState(defenseClients[defenseLiving[0].index], (state) => state.phase === "night" && state.day === 2);
  for (const [{ index }, verdict] of defenseLiving.map((entry, index) => [entry, index === 0 ? "kill" : "spare"])) {
    assert((await emit(defenseClients[index], "act", { targets: [], mode: verdict })).ok);
  }
  const survivedState = await survivedToNight;
  assert(survivedState.players.find((player) => player.id === accused).alive);
  defenseClients.forEach((client) => client.disconnect());

  console.log("Smoke test passed: room management, phases, timed votes, replay, roles, and win conditions.");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    openClients.forEach((client) => client.disconnect());
    server.kill();
  });
