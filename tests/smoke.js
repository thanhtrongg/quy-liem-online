const { spawn } = require("child_process");
const { io } = require("socket.io-client");
const assert = require("assert");

const port = 3200 + Math.floor(Math.random() * 700);
const origin = `http://localhost:${port}`;
const latest = new WeakMap();
let openClients = [];
const server = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), VOTE_DURATION_MS: "1000", DEFENSE_DURATION_MS: "160" },
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

async function run() {
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
  const savedDay = witchClients.map((client) => nextState(client, (state) => state.phase === "day"));
  assert((await emit(witchClients[witchIndex], "act", { targets: [], mode: "save" })).ok);
  assert((await Promise.all(savedDay)).every((state) => state.players.every((player) => player.alive)));
  witchClients.forEach((client) => client.disconnect());

  const equalClients = await createGroup("Equal", { demon: 2, seer: 0, witch: 0, guard: 0, villager: 2, hunter: 0, cupid: 0, junior: 0 });
  const ended = await Promise.all(equalClients.map((client) => nextState(client, (state) => state.phase === "ended")));
  assert(ended.every((state) => state.winner === "demon"));
  assert((await emit(equalClients[1], "replay-room", {})).error);
  const replayLobby = equalClients.map((client) => nextState(client, (state) => state.phase === "lobby"));
  assert((await emit(equalClients[0], "replay-room", {})).ok);
  const replayStates = await Promise.all(replayLobby);
  assert(replayStates.every((state) => state.players.every((player) => player.alive && player.role === null)));
  equalClients.forEach((client) => client.disconnect());

  const cupidClients = await createGroup("Cupid", { demon: 1, seer: 0, witch: 0, guard: 0, villager: 2, hunter: 0, cupid: 1, junior: 0 });
  const cupidNight = await Promise.all(cupidClients.map((client) => nextState(client, (state) => state.phase === "night")));
  const cupidIndex = cupidNight.findIndex((state) => state.me.role === "cupid");
  const cupidDemonIndex = cupidNight.findIndex((state) => state.me.role === "demon");
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
  await defensePhase;
  assert(Date.now() - allVotesStartedAt < 700);
  const survivedToNight = nextState(defenseClients[defenseLiving[0].index], (state) => state.phase === "night" && state.day === 2);
  for (const { index } of defenseLiving) assert((await emit(defenseClients[index], "act", { targets: [], mode: "withdraw" })).ok);
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
