const socket = io();
const $ = (id) => document.getElementById(id);
let state = null;
let selected = [];
let witchMode = null;
let audioContext = null;
let soundEnabled = localStorage.getItem("quy-liem-muted") !== "true";
let musicEnabled = localStorage.getItem("quy-liem-music-muted") !== "true";
let effectTimer = null;
let clockTimer = null;
$("background-music").volume = 0.3;
$("death-scream").volume = 0.78;

const phaseNames = { lobby: "Sảnh chờ", night: "Mọi người đi ngủ", day: "Đang bỏ phiếu", defense: "Thời gian phản biện", hunter: "Phát súng cuối", ended: "Trò chơi kết thúc" };
const teamNames = { demon: "Phe Quỷ Liếm", village: "Phe khu phố" };

function showError(id, message = "") { $(id).textContent = message; }
function enterRoom() { $("welcome").classList.add("hidden"); $("game").classList.remove("hidden"); }
function unlockAudio() {
  if (soundEnabled) {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
  }
  if (musicEnabled) $("background-music").play().catch(() => {});
}
document.addEventListener("pointerdown", unlockAudio, { passive: true });

$("sound-toggle").onclick = () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("quy-liem-muted", String(!soundEnabled));
  if (soundEnabled) unlockAudio();
  renderSoundToggle();
};
$("music-toggle").onclick = () => {
  musicEnabled = !musicEnabled;
  localStorage.setItem("quy-liem-music-muted", String(!musicEnabled));
  if (musicEnabled) $("background-music").play().catch(() => {});
  else $("background-music").pause();
  renderSoundToggle();
};

function renderSoundToggle() {
  $("sound-toggle").textContent = soundEnabled ? "Âm thanh: Bật" : "Âm thanh: Tắt";
  $("sound-toggle").classList.toggle("muted", !soundEnabled);
  $("music-toggle").textContent = musicEnabled ? "Nhạc nền: Bật" : "Nhạc nền: Tắt";
  $("music-toggle").classList.toggle("muted", !musicEnabled);
}
function rememberSession(res) {
  localStorage.setItem("quy-liem-session", JSON.stringify({ code: res.code, token: res.token }));
}

$("create").onclick = () => socket.emit("create-room", { name: $("name").value }, (res) => {
  if (res.error) return showError("welcome-error", res.error);
  rememberSession(res);
  enterRoom();
});
$("join").onclick = () => socket.emit("join-room", { name: $("name").value, code: $("code").value }, (res) => {
  if (res.error) return showError("welcome-error", res.error);
  rememberSession(res);
  enterRoom();
});
$("copy-code").onclick = async () => {
  await navigator.clipboard.writeText(state.code);
  $("copy-code").textContent = "ĐÃ COPY";
  setTimeout(() => { $("copy-code").textContent = state.code; }, 900);
};
$("start").onclick = () => socket.emit("start-game", {}, (res) => showError("host-error", res.error));
$("replay-room").onclick = () => socket.emit("replay-room", {}, (res) => showError("end-error", res.error));
$("new-room").onclick = () => {
  localStorage.removeItem("quy-liem-session");
  window.location.reload();
};

socket.on("state", (next) => {
  const previous = state;
  const actionChanged = state?.action?.type !== next.action?.type || state?.phase !== next.phase;
  state = next;
  if (actionChanged) { selected = []; witchMode = null; }
  render();
  runStateEffects(previous, next);
});
socket.on("connect", () => {
  const saved = JSON.parse(localStorage.getItem("quy-liem-session") || "null");
  if (saved) socket.emit("resume", saved, (res) => {
    if (res.error) localStorage.removeItem("quy-liem-session");
    else enterRoom();
  });
});

function render() {
  enterRoom();
  document.body.dataset.phase = state.phase;
  renderSoundToggle();
  $("copy-code").textContent = state.code;
  $("phase-label").textContent = phaseNames[state.phase] || state.phase;
  $("day-label").textContent = state.day ? `${state.phase === "night" ? "Đêm" : "Ngày"} ${state.day}` : "";
  renderIdentity();
  renderPlayers();
  renderAction();
  renderLogs();
  renderHost();
  renderEndPanel();
  const banner = $("banner");
  if (state.status === "ended") {
    banner.classList.add("hidden");
  } else if (state.phase === "hunter" && state.hunterRevealName) {
    banner.textContent = `${state.hunterRevealName} chính là Lọ Vương. Anh ta đang chọn một người chết chung.`;
    banner.classList.remove("hidden");
  } else if (state.phase === "defense" && state.accusedName) {
    banner.textContent = `${state.accusedName} đang phản biện. Những người đã buộc tội có thể rút phiếu.`;
    banner.classList.remove("hidden");
  } else banner.classList.add("hidden");
  renderClock();
}

function renderEndPanel() {
  const panel = $("end-panel");
  if (state.status !== "ended") return panel.classList.add("hidden");
  panel.classList.remove("hidden");
  $("end-title").textContent = `${teamNames[state.winner]} chiến thắng`;
  $("end-help").textContent = state.isHost ? "Bạn có thể giữ nguyên mọi người và mở một ván mới." : "Chờ chủ phòng mở lại ván hoặc tạo một phòng mới.";
  $("replay-room").classList.toggle("hidden", !state.isHost);
  showError("end-error");
}

function renderClock() {
  clearInterval(clockTimer);
  const clock = $("phase-clock");
  if (!state.phaseEndsAt) return clock.classList.add("hidden");
  const update = () => {
    const remaining = Math.max(0, state.phaseEndsAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    clock.classList.toggle("urgent", seconds <= 30);
  };
  clock.classList.remove("hidden");
  update();
  clockTimer = setInterval(update, 250);
}

function runStateEffects(previous, next) {
  if (!previous || previous.status === "lobby") return;
  const newlyDead = next.players.filter((player) => {
    const before = previous.players.find((old) => old.id === player.id);
    return before?.alive && !player.alive;
  });
  if (newlyDead.length) showDeathScene(newlyDead.map((player) => player.name));
  if (previous.phase !== next.phase && !newlyDead.length) showPhaseTransition(next);
  if (previous.status !== "ended" && next.status === "ended") playWinSound(next.winner);
}

function showPhaseTransition(next) {
  if (!["night", "day", "hunter"].includes(next.phase)) return;
  const overlay = $("phase-transition");
  $("transition-title").textContent = phaseNames[next.phase];
  $("transition-subtitle").textContent = next.phase === "night" ? `Đêm ${next.day} bắt đầu` : next.phase === "day" ? `Ngày ${next.day} bắt đầu` : "Một người sắp bị kéo xuống mồ";
  overlay.className = `cinematic-overlay show ${next.phase}`;
  playPhaseSound(next.phase);
  clearTimeout(effectTimer);
  effectTimer = setTimeout(() => overlay.className = "cinematic-overlay", 2200);
}

function showDeathScene(names) {
  const scene = $("death-scene");
  $("death-name").textContent = names.join(" và ");
  scene.classList.remove("show");
  void scene.offsetWidth;
  scene.classList.add("show");
  document.body.classList.add("death-shake");
  playDeathSound();
  setTimeout(() => document.body.classList.remove("death-shake"), 750);
  setTimeout(() => scene.classList.remove("show"), 3000);
}

function tone(frequency, start, duration, type = "sine", volume = 0.08, destination = null) {
  if (!soundEnabled || !audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(destination || audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function noise(start, duration, volume = 0.04) {
  if (!soundEnabled || !audioContext) return;
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = 850;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(audioContext.destination);
  source.start(start);
}

function playPhaseSound(phase) {
  if (!soundEnabled || !audioContext) return;
  const now = audioContext.currentTime;
  if (phase === "night") {
    tone(92, now, 1.7, "sine", 0.12);
    tone(138, now + 0.12, 1.5, "triangle", 0.05);
  } else {
    tone(210, now, 0.7, "triangle", 0.06);
    tone(315, now + 0.15, 0.8, "sine", 0.04);
  }
}

function playDeathSound() {
  if (!soundEnabled) return;
  const scream = $("death-scream");
  scream.currentTime = 0;
  scream.play().catch(() => {});
}

function playWinSound(winner) {
  if (!soundEnabled || !audioContext) return;
  const now = audioContext.currentTime;
  const notes = winner === "village" ? [220, 277, 330] : [110, 92, 73];
  notes.forEach((note, index) => tone(note, now + index * 0.22, 0.9, "triangle", 0.08));
}

function renderIdentity() {
  const role = state.me?.role;
  $("role-name").textContent = role ? state.roleInfo[role].name : "Chưa phân vai";
  $("role-desc").textContent = state.me?.description || "Chờ chủ phòng bắt đầu trò chơi.";
  const bits = [];
  const cupidPair = state.me?.cupidPair?.map((id) => state.players.find((p) => p.id === id)?.name).filter(Boolean);
  if (state.me?.role === "cupid" && cupidPair?.length === 2) bits.push(`Hai người đã ghép đôi: ${cupidPair.join(" và ")}`);
  const mates = state.players.filter((p) => p.role && p.id !== state.me?.id && state.roleInfo[p.role]?.team === "demon" && state.roleInfo[role]?.team === "demon");
  if (mates.length) bits.push(`Đồng đội: ${mates.map((p) => p.name).join(", ")}`);
  if (state.seerResult) bits.push(`${state.seerResult.targetName}: ${state.seerResult.isDemon ? "LÀ Quỷ Liếm" : "không phải Quỷ Liếm"}`);
  $("private-info").innerHTML = bits.map((x) => `<p>${escapeHtml(x)}</p>`).join("");
}

function renderPlayers() {
  $("player-count").textContent = `${state.players.filter((p) => p.alive).length}/${state.players.length} còn sống`;
  const blankVoters = new Set(state.blankVoters || []);
  $("players").innerHTML = state.players.map((p) => `
    <div class="player ${p.alive ? "" : "dead"} ${p.id === state.me?.id ? "me" : ""}">
      ${renderSigil(p)}
      <div class="player-copy"><strong>${escapeHtml(p.name)}${p.id === state.me?.id ? " (bạn)" : ""}</strong>
      <small>${p.role ? state.roleInfo[p.role].name : p.connected ? (p.alive ? "Còn sống" : "Đã chết") : "Mất kết nối"}</small>
      </div><span class="status-dot"></span>
      ${blankVoters.has(p.id) ? '<span class="white-flag" title="Đã bỏ phiếu trắng">⚑</span>' : ""}
      ${renderVotesFor(p.id)}
    </div>`).join("");
}

function renderVotesFor(targetId) {
  const voterIds = state.votesByTarget?.[targetId] || [];
  if (!voterIds.length) return "";
  const voters = voterIds.map((id) => state.players.find((player) => player.id === id)).filter(Boolean);
  return `<div class="vote-stack"><b>${voters.length}</b>${voters.map((player) => renderSigil(player, true)).join("")}</div>`;
}

function renderSigil(player, mini = false) {
  const index = Math.max(0, state.players.findIndex((candidate) => candidate.id === player.id));
  const rotation = (index * 47) % 90 - 45;
  const pattern = index % 5;
  const palette = index % 6;
  return `<span class="player-avatar sigil-${pattern} palette-${palette} ${mini ? "mini" : ""}" style="--r:${rotation}deg" title="${escapeHtml(player.name)}"><i></i></span>`;
}

function renderAction() {
  const action = state.action;
  $("targets").innerHTML = "";
  $("witch-actions").innerHTML = "";
  $("submit-action").textContent = "Xác nhận";
  $("submit-action").classList.add("hidden");
  $("skip-action").classList.add("hidden");
  showError("action-error");
  if (!state.me?.alive && action?.type !== "hunter") {
    $("action-title").textContent = "Bạn đã chết";
    $("action-help").textContent = "Hãy quan sát khu phố đi đến kết cục.";
    return;
  }
  if (action?.type === "withdraw") {
    $("action-title").textContent = action.label;
    $("action-help").textContent = "Rút phiếu để người đang phản biện có cơ hội sống.";
    $("submit-action").textContent = "Rút phiếu";
    $("submit-action").classList.remove("hidden");
    $("submit-action").onclick = () => submit("withdraw");
    return;
  }
  if (!action) {
    if (state.phase === "defense") {
      $("action-title").textContent = state.me.id === state.accusedId ? "Bạn đang bị buộc tội" : `${state.accusedName} đang phản biện`;
      $("action-help").textContent = state.me.id === state.accusedId ? "Bạn có 30 giây để thuyết phục khu phố rút phiếu." : "Bạn không bỏ phiếu cho người này nên không cần rút phiếu.";
    } else if (state.phase === "hunter") {
      $("action-title").textContent = `${state.hunterRevealName} là Lọ Vương`;
      $("action-help").textContent = "Hãy chờ Lọ Vương chọn người chết chung.";
    } else {
      $("action-title").textContent = state.phase === "lobby" ? "Chờ đủ người" : "Hãy chờ...";
      $("action-help").textContent = state.phase === "day" ? "Thời gian bỏ phiếu vẫn đang diễn ra." : "Những người có kỹ năng đang hành động.";
    }
    return;
  }
  $("action-title").textContent = action.label;
  $("action-help").textContent = action.count === 2 ? "Chọn đúng hai người." : "Chạm vào một người để chọn.";
  if (action.type === "witch") renderWitch(action);
  else renderTargets(action);
  if (action.allowSkip) {
    $("skip-action").classList.remove("hidden");
    $("skip-action").textContent = action.type === "vote" ? "Bỏ phiếu trắng" : "Bỏ qua";
    $("skip-action").onclick = () => submit("skip");
  }
}

function eligible(action, player) {
  if (!player.alive) return false;
  if (action.exclude?.includes(player.id)) return false;
  if (action.excludeTeam && player.role && state.roleInfo[player.role]?.team === "demon") return false;
  if (action.type === "hunter" && player.id === state.me.id) return false;
  return true;
}

function renderTargets(action) {
  const choices = state.players.filter((p) => eligible(action, p));
  $("targets").innerHTML = choices.map((p) => `<button class="target ${selected.includes(p.id) ? "selected" : ""}" data-id="${p.id}">${renderSigil(p, true)}<span><strong>${escapeHtml(p.name)}</strong><small>${p.id === state.me.id ? "Bạn" : "Còn sống"}</small></span></button>`).join("");
  document.querySelectorAll(".target").forEach((el) => el.onclick = () => {
    const id = el.dataset.id;
    if (selected.includes(id)) selected = selected.filter((x) => x !== id);
    else if (selected.length < action.count) selected.push(id);
    else selected = [id];
    renderAction();
  });
  if (selected.length === action.count) {
    $("submit-action").classList.remove("hidden");
    $("submit-action").onclick = () => submit(null);
  }
}

function renderWitch(action) {
  const options = [];
  if (state.witch.save && action.victimId) {
    const victim = state.players.find((p) => p.id === action.victimId);
    options.push(`<button data-mode="save" class="${witchMode === "save" ? "active" : ""}">Cứu ${escapeHtml(victim?.name || "")}</button>`);
  }
  if (state.witch.poison) options.push(`<button data-mode="poison" class="${witchMode === "poison" ? "active" : ""}">Dùng bùa hại</button>`);
  $("witch-actions").innerHTML = options.join("");
  document.querySelectorAll("[data-mode]").forEach((el) => el.onclick = () => {
    witchMode = el.dataset.mode;
    selected = [];
    renderAction();
  });
  if (witchMode === "poison") renderTargets(action);
  if (witchMode === "save") {
    $("submit-action").classList.remove("hidden");
    $("submit-action").onclick = () => submit("save");
  }
}

function submit(mode) {
  socket.emit("act", { targets: selected, mode: mode || witchMode }, (res) => {
    if (res.error) showError("action-error", res.error);
    else {
      selected = [];
      witchMode = null;
    }
  });
}

function renderLogs() {
  $("logs").innerHTML = [...state.logs].reverse().map((log) => `<div class="log ${log.type}">${escapeHtml(log.message)}</div>`).join("");
}

function renderHost() {
  const panel = $("host-panel");
  if (!state.isHost || state.status !== "lobby") return panel.classList.add("hidden");
  panel.classList.remove("hidden");
  $("role-config").innerHTML = Object.entries(state.roles).map(([role, count]) => `
    <label class="role-control"><span>${state.roleInfo[role].name}</span><input type="number" min="0" max="20" data-role="${role}" value="${count}"></label>`).join("");
  $("role-total").textContent = `Tổng vai: ${Object.values(state.roles).reduce((a, b) => a + b, 0)} / ${state.players.length} người`;
  document.querySelectorAll("[data-role]").forEach((el) => el.onchange = () => {
    const roles = { ...state.roles, [el.dataset.role]: Number(el.value) };
    socket.emit("set-roles", roles);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
