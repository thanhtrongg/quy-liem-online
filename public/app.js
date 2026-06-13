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
let roleBookOpen = false;
let previousRole = null;
let toastTimer = null;
let roleCardRevealed = false;

const ROLE_CARD_IMAGES = {
  demon: "quyliem",
  junior: "quyliemnhi",
  seer: "cobehaydoan",
  witch: "caubechoibua",
  guard: "gabeonongtinh",
  villager: "anhhangxom",
  springroll: "chagio",
  hunter: "lovuong",
  cupid: "nguoiyeucu",
  spirit: "quyliemtinh",
  bisexual: "gaylo",
  thangngoo: "thangngoo",
  priest: "chasu",
};
let ambientGlitchTimer = null;
let voiceActive = false;
let voiceStream = null;
let voiceError = "";
const voicePeers = new Map();
const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
$("background-music").volume = 0.3;
$("death-scream").volume = 0.78;

const phaseNames = {
  lobby: "Sảnh chờ",
  night: "Mọi người đi ngủ",
  day: "Đang bỏ phiếu",
  defense: "Thời gian phản biện",
  hunter: "Phát súng cuối",
  ended: "Trò chơi kết thúc",
};
const nightStepNames = {
  cupid: "Người Yêu Cũ thức dậy",
  wolves: "Đàn Quỷ thức dậy",
  spirit: "Quỷ Liếm Tinh thức dậy",
  seer: "Cô Bé Hay Đoán thức dậy",
  guard: "Gã Béo Nóng Tính thức dậy",
  witch: "Cậu Bé Chơi Bùa thức dậy",
  priest: "Cha Sứ thức dậy",
};
const teamNames = {
  demon: "Phe Quỷ Liếm",
  village: "Phe khu phố",
  loner: "Phe Độc Hành",
};
const TRANSITION_FLAVOR = {
  night: {
    title: "Mọi người đi ngủ",
    sub: (day) => `Đêm ${day}. Bóng tối ôm trọn khu phố...`,
  },
  day: {
    title: "Đang bỏ phiếu",
    sub: (day) =>
      `${day === 1 ? "Bình minh đầu tiên. Ai sẽ sống, ai sẽ chết?" : `Ngày ${day}. Ai sống? Ai chết?`}`,
  },
  defense: {
    title: "Thời gian phản biện",
    sub: () => "Người bị buộc tội đứng trước đám đông. Lời cuối cùng...",
  },
  hunter: {
    title: "Phát súng cuối",
    sub: () => "Một người sắp bị kéo xuống mồ...",
  },
};

function showError(id, message = "") {
  $(id).textContent = message;
}
function enterRoom() {
  $("welcome").classList.add("hidden");
  $("game").classList.remove("hidden");
}
function unlockAudio() {
  if (soundEnabled) {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
  }
  if (musicEnabled)
    $("background-music")
      .play()
      .catch(() => {});
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
  if (musicEnabled)
    $("background-music")
      .play()
      .catch(() => {});
  else $("background-music").pause();
  renderSoundToggle();
};

function renderSoundToggle() {
  $("sound-toggle").textContent = soundEnabled
    ? "Âm thanh: Bật"
    : "Âm thanh: Tắt";
  $("sound-toggle").classList.toggle("muted", !soundEnabled);
  $("music-toggle").textContent = musicEnabled
    ? "Nhạc nền: Bật"
    : "Nhạc nền: Tắt";
  $("music-toggle").classList.toggle("muted", !musicEnabled);
}

function sendVoiceSignal(targetId, signal) {
  socket.emit("voice-signal", { targetId, signal }, () => {});
}

function closeVoicePeer(peerId) {
  const peer = voicePeers.get(peerId);
  if (!peer) return;
  peer.pc.onicecandidate = null;
  peer.pc.ontrack = null;
  peer.pc.close();
  peer.audio.remove();
  voicePeers.delete(peerId);
}

function stopVoice() {
  voiceActive = false;
  voiceStream?.getTracks().forEach((track) => track.stop());
  voiceStream = null;
  [...voicePeers.keys()].forEach(closeVoicePeer);
  renderVoiceToggle();
}

function createVoicePeer(peerId) {
  if (!voiceActive || !voiceStream || !state?.voice?.peerIds?.includes(peerId))
    return null;
  if (voicePeers.has(peerId)) return voicePeers.get(peerId).pc;

  const pc = new RTCPeerConnection(RTC_CONFIG);
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.playsInline = true;
  audio.dataset.peerId = peerId;
  $("voice-audio").append(audio);
  voiceStream.getTracks().forEach((track) => pc.addTrack(track, voiceStream));
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) sendVoiceSignal(peerId, { type: "candidate", candidate });
  };
  pc.ontrack = ({ streams }) => {
    audio.srcObject = streams[0];
    audio.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.connectionState))
      closeVoicePeer(peerId);
  };
  voicePeers.set(peerId, { pc, audio });
  return pc;
}

async function offerVoice(peerId) {
  const pc = createVoicePeer(peerId);
  if (!pc || pc.signalingState !== "stable") return;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendVoiceSignal(peerId, { type: "offer", sdp: pc.localDescription });
}

async function startVoice() {
  if (!state?.voice?.enabled || voiceActive) return;
  voiceError = "";
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    if (!state?.voice?.enabled) {
      voiceStream.getTracks().forEach((track) => track.stop());
      voiceStream = null;
      return;
    }
    voiceActive = true;
    renderVoiceToggle();
    for (const peerId of state.voice.peerIds) {
      sendVoiceSignal(peerId, { type: "ready" });
      if (state.me.id.localeCompare(peerId) < 0)
        offerVoice(peerId).catch(() => {});
    }
  } catch {
    voiceError = "Trình duyệt chưa cấp quyền mic";
    stopVoice();
  }
}

function syncVoiceAccess() {
  if (!state?.voice?.enabled) {
    voiceError = "";
    stopVoice();
    return;
  }
  const allowedPeers = new Set(state.voice.peerIds);
  [...voicePeers.keys()]
    .filter((peerId) => !allowedPeers.has(peerId))
    .forEach(closeVoicePeer);
  if (!voiceActive) return renderVoiceToggle();
  for (const peerId of allowedPeers) {
    sendVoiceSignal(peerId, { type: "ready" });
    if (state.me.id.localeCompare(peerId) < 0)
      offerVoice(peerId).catch(() => {});
  }
  renderVoiceToggle();
}

function renderVoiceToggle() {
  const button = $("mic-toggle");
  if (!button) return;
  button.classList.toggle("hidden", !state?.voice?.enabled);
  button.classList.toggle("active", voiceActive);
  button.classList.toggle("error", Boolean(voiceError));
  button.textContent = voiceError || (voiceActive ? "Tắt mic" : "Bật mic");
  button.setAttribute("aria-pressed", String(voiceActive));
}

$("mic-toggle").onclick = () => {
  if (voiceActive) stopVoice();
  else startVoice();
};

socket.on("voice-signal", async ({ fromId, signal }) => {
  if (!voiceActive || !state?.voice?.peerIds?.includes(fromId) || !signal)
    return;
  try {
    if (signal.type === "ready") {
      if (state.me.id.localeCompare(fromId) < 0) await offerVoice(fromId);
      return;
    }
    const pc = createVoicePeer(fromId);
    if (!pc) return;
    if (signal.type === "offer") {
      await pc.setRemoteDescription(signal.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendVoiceSignal(fromId, { type: "answer", sdp: pc.localDescription });
    } else if (signal.type === "answer") {
      await pc.setRemoteDescription(signal.sdp);
    } else if (signal.type === "candidate") {
      await pc.addIceCandidate(signal.candidate);
    }
  } catch {
    closeVoicePeer(fromId);
  }
});

function rememberSession(res) {
  localStorage.setItem(
    "quy-liem-session",
    JSON.stringify({ code: res.code, token: res.token }),
  );
}

$("create").onclick = () =>
  socket.emit("create-room", { name: $("name").value }, (res) => {
    if (res.error) return showError("welcome-error", res.error);
    rememberSession(res);
    enterRoom();
  });
$("join").onclick = () =>
  socket.emit(
    "join-room",
    { name: $("name").value, code: $("code").value },
    (res) => {
      if (res.error) return showError("welcome-error", res.error);
      rememberSession(res);
      enterRoom();
    },
  );
$("copy-code").onclick = async () => {
  await navigator.clipboard.writeText(state.code);
  $("copy-code").textContent = "ĐÃ COPY";
  setTimeout(() => {
    $("copy-code").textContent = state.code;
  }, 900);
};
$("start").onclick = () =>
  socket.emit("start-game", {}, (res) => showError("host-error", res.error));
$("replay-room").onclick = () =>
  socket.emit("replay-room", {}, (res) => showError("end-error", res.error));
$("new-room").onclick = () => {
  localStorage.removeItem("quy-liem-session");
  window.location.reload();
};
$("cancel-room").onclick = () => {
  if (
    !window.confirm(
      "Hủy phòng hiện tại? Tất cả người chơi sẽ bị đưa về màn hình chính.",
    )
  )
    return;
  socket.emit("cancel-room", {}, (res) => {
    if (res?.error) showError("host-error", res.error);
  });
};
$("leave-room").onclick = () => {
  if (!window.confirm("Rời phòng hiện tại?")) return;
  socket.emit("leave-room", {}, (res) => {
    if (res?.error) window.alert(res.error);
  });
};
$("role-book-toggle").onclick = () => toggleRoleBook();
$("role-book-close").onclick = () => toggleRoleBook(false);
$("book-backdrop").onclick = () => toggleRoleBook(false);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && roleBookOpen) toggleRoleBook(false);
});

function toggleRoleBook(force) {
  roleBookOpen = typeof force === "boolean" ? force : !roleBookOpen;
  $("role-book").classList.toggle("open", roleBookOpen);
  $("role-book").setAttribute("aria-hidden", String(!roleBookOpen));
  $("role-book-toggle").setAttribute("aria-expanded", String(roleBookOpen));
}

socket.on("state", (next) => {
  const previous = state;
  const actionChanged =
    state?.action?.type !== next.action?.type || state?.phase !== next.phase;
  state = next;
  if (actionChanged) {
    selected = [];
    witchMode = null;
  }
  toggleRoleBook(false);
  syncVoiceAccess();
  render();
  setRoleParticles(next.me?.role, next.phase);
  runStateEffects(previous, next);
  if (next.status === "playing" && (!previous || previous.status !== "playing"))
    startAmbientGlitch();
  if (next.status === "ended" || next.status === "lobby") {
    stopAmbientGlitch();
    roleParticles.stop();
  }
  if (next.status === "lobby") {
    roleCardRevealed = false;
    $("mini-card").classList.add("hidden");
    bookFilter = "all";
    const filterEl = $("book-filter");
    if (filterEl) {
      filterEl.querySelectorAll(".filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === "all"));
    }
  }
});
socket.on("connect", () => {
  const saved = JSON.parse(localStorage.getItem("quy-liem-session") || "null");
  if (saved)
    socket.emit("resume", saved, (res) => {
      if (res.error) localStorage.removeItem("quy-liem-session");
      else enterRoom();
    });
});
socket.on("room-closed", ({ reason }) => {
  stopAmbientGlitch();
  stopVoice();
  localStorage.removeItem("quy-liem-session");
  state = null;
  selected = [];
  witchMode = null;
  $("game").classList.add("hidden");
  $("welcome").classList.remove("hidden");
  showError("welcome-error", reason || "Phòng hiện tại đã đóng.");
});
socket.on("disconnect", stopVoice);

function render() {
  enterRoom();
  document.body.dataset.phase = state.phase;
  document.body.dataset.role = state.me?.role || "";
  document.body.dataset.gameStatus = state.status;
  renderSoundToggle();
  renderVoiceToggle();
  $("leave-room").classList.toggle(
    "hidden",
    state.isHost || !["lobby", "ended"].includes(state.status),
  );
  $("copy-code").textContent = state.code;
  $("phase-label").textContent =
    state.phase === "night" && state.nightStep
      ? nightStepNames[state.nightStep] || phaseNames.night
      : phaseNames[state.phase] || state.phase;
  $("day-label").textContent = state.day
    ? `${state.phase === "night" ? "Đêm" : "Ngày"} ${state.day}`
    : "";
  renderIdentity();
  renderPlayers();
  renderAction();
  renderLogs();
  renderHost();
  renderEndPanel();
  renderRoleBook();
  const banner = $("banner");
  if (state.status === "ended") {
    banner.classList.add("hidden");
  } else if (state.phase === "hunter" && state.hunterRevealName) {
    banner.textContent = `${state.hunterRevealName} chính là Lọ Vương. Anh ta đang chọn một người chết chung.`;
    banner.classList.remove("hidden");
  } else if (state.phase === "defense" && state.accusedName) {
    banner.textContent = `${state.accusedName} đang phản biện. Hãy chọn Giết hoặc Tha. Tha phải nhiều hơn Giết để người này sống.`;
    banner.classList.remove("hidden");
  } else banner.classList.add("hidden");
  renderClock();
}

function renderRoleBook() {
  const teams = ["demon", "village", "loner"];
  const teamLabels = { demon: "Phe Quỷ Liếm", village: "Phe Khu Phố", loner: "Phe Độc Hành" };
  const filter = bookFilter;
  const allRoles = [];
  teams.forEach((team) => {
    Object.entries(state.roleInfo).forEach(([key, info]) => {
      if (info.team === team) allRoles.push({ key, ...info, team });
    });
  });
  const filtered = filter === "all" ? allRoles : allRoles.filter((r) => r.team === filter);
  const html = filtered.length
    ? filtered.map((role) => {
        const tagClass = `tag-${role.team}`;
        const filename = ROLE_CARD_IMAGES[role.key];
        const cardImg = filename ? `<img src="/images/${filename}.png" alt="" class="book-entry-thumb">` : "";
        return `<article class="book-entry" data-team="${role.team}">
          <span class="book-entry-icon">${role.icon || "•"}</span>
          <div class="book-entry-body">
            <div class="book-entry-name">
              ${role.name}
              <span class="book-entry-tag ${tagClass}">${teamLabels[role.team] || role.team}</span>
            </div>
            <p class="book-entry-desc">${escapeHtml(role.description)}</p>
            ${role.flavor ? `<em class="book-entry-flavor">"${escapeHtml(role.flavor)}"</em>` : ""}
          </div>
          ${cardImg ? `<div class="book-entry-card">${cardImg}</div>` : ""}
        </article>`;
      }).join("")
    : `<p class="book-empty">Không có vai trò nào.</p>`;
  $("book-pages").innerHTML = html;
}

let bookFilter = "all";
$("book-filter").onclick = (e) => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  bookFilter = btn.dataset.filter;
  $("book-filter").querySelectorAll(".filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
  renderRoleBook();
};

function renderEndPanel() {
  const panel = $("end-panel");
  if (state.status !== "ended") return panel.classList.add("hidden");
  panel.classList.remove("hidden");
  $("end-title").textContent = `${teamNames[state.winner]} chiến thắng`;
  $("end-help").textContent = state.isHost
    ? "Bạn có thể giữ nguyên mọi người và mở một ván mới."
    : "Chờ chủ phòng mở lại ván hoặc tạo một phòng mới.";
  $("replay-room").classList.toggle("hidden", !state.isHost);
  showError("end-error");
  const teamOrder = [
    state.winner,
    ...["village", "demon", "loner"].filter((team) => team !== state.winner),
  ];
  const allRoles = [];
  teamOrder.forEach((team) => {
    state.players.forEach((p) => {
      if (p.role && state.roleInfo[p.role]?.team === team) {
        allRoles.push(p);
      }
    });
  });
  $("role-reveal-list").innerHTML = allRoles.length
    ? `<table>${allRoles
        .map(
          (p, i) =>
            `<tr class="reveal-entry" style="--index:${i}">
          <td class="reveal-icon">${state.roleInfo[p.role].icon || "•"}</td>
          <td class="reveal-role">${escapeHtml(state.roleInfo[p.role].name)}</td>
          <td class="reveal-name">${escapeHtml(p.name)}</td>
          <td class="reveal-status ${p.alive ? "alive" : "dead"}">${p.alive ? "Còn sống" : "Đã chết"}</td>
        </tr>`,
        )
        .join("")}</table>`
    : "<p class='muted'>Không có dữ liệu vai trò.</p>";
}

function renderClock() {
  clearInterval(clockTimer);
  const clock = $("phase-clock");
  const digits = $("clock-digits");
  const fill = $("timer-fill");
  if (!state.phaseEndsAt || !state.phaseStartedAt) {
    document.body.classList.remove("urgent-10");
    return clock.classList.add("hidden");
  }
  const total = state.phaseEndsAt - state.phaseStartedAt;
  const update = () => {
    const remaining = Math.max(0, state.phaseEndsAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    digits.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    clock.classList.toggle("urgent", seconds <= 30);
    document.body.classList.toggle("urgent-10", seconds <= 10);
    const pct = total > 0 ? (remaining / total) * 100 : 0;
    fill.style.width = pct + "%";
    fill.style.background =
      seconds <= 15
        ? "var(--red)"
        : seconds <= 35
          ? "var(--gold)"
          : "var(--green)";
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
  if (newlyDead.length) {
    showDeathScene(newlyDead.map((player) => player.name));
    newlyDead.forEach((player) => {
      const el = document.querySelector(`.player[data-id="${player.id}"]`);
      if (el) {
        el.classList.add("dead-animate");
        setTimeout(() => el.classList.add("skull-overlay"), 400);
      }
    });
  }
  if (previous.phase !== next.phase && !newlyDead.length) {
    showPhaseTransition(next);
    if (next.phase === "night" || next.phase === "day") {
      triggerGlitch();
      triggerNoise(400);
    }
  }
  if (previous.status !== "ended" && next.status === "ended") {
    playWinSound(next.winner);
    triggerGlitch();
    triggerNoise(700);
    showConfetti(next.winner);
  }
  if (previous.phase !== "night" && next.phase === "night") {
    roleParticles.setRole(next.me?.role, "night");
  }
}

function showPhaseTransition(next) {
  if (!["night", "day", "defense", "hunter"].includes(next.phase)) return;
  const overlay = $("phase-transition");
  const flavor = TRANSITION_FLAVOR[next.phase] || TRANSITION_FLAVOR.day;
  $("transition-title").textContent = flavor.title;
  $("transition-subtitle").textContent = flavor.sub(next.day || 1);
  overlay.className = `cinematic-overlay show ${next.phase}`;
  playPhaseSound(next.phase);
  if (next.phase === "defense") playDefenseSound();
  clearTimeout(effectTimer);
  effectTimer = setTimeout(
    () => (overlay.className = "cinematic-overlay"),
    2200,
  );
}

function showDeathScene(names) {
  const scene = $("death-scene");
  $("death-name").textContent = names.join(" và ");
  scene.classList.remove("show");
  void scene.offsetWidth;
  scene.classList.add("show");
  document.body.classList.add("death-shake");
  playDeathSound();
  triggerGlitch();
  triggerNoise(500);
  $("blood-splatter").classList.add("show");
  setTimeout(() => document.body.classList.remove("death-shake"), 750);
  setTimeout(() => {
    scene.classList.remove("show");
    $("blood-splatter").classList.remove("show");
  }, 3000);
}

function showConfetti(winner) {
  const colors =
    winner === "village"
      ? ["#e4b45b", "#55d39a", "#f4eff8"]
      : ["#ef3157", "#ff6d00", "#d50000"];
  const container = document.createElement("div");
  container.className = "confetti-container";
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.width = 4 + Math.random() * 6 + "px";
    piece.style.height = 4 + Math.random() * 6 + "px";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    piece.style.animationDuration = 2 + Math.random() * 3 + "s";
    piece.style.animationDelay = Math.random() * 1.5 + "s";
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 6000);
}

function triggerGlitch() {
  const overlay = $("#glitch-overlay");
  overlay.classList.remove("active");
  void overlay.offsetWidth;
  overlay.classList.add("active");
  setTimeout(() => overlay.classList.remove("active"), 450);
}

function startAmbientGlitch() {
  stopAmbientGlitch();
  function schedule() {
    const delay = 3000 + Math.random() * 5000;
    ambientGlitchTimer = setTimeout(() => {
      if (!state || state.status !== "playing") return;
      const overlay = $("#glitch-overlay");
      overlay.classList.remove("ambient");
      void overlay.offsetWidth;
      overlay.classList.add("ambient");
      setTimeout(() => overlay.classList.remove("ambient"), 200);
      schedule();
    }, delay);
  }
  schedule();
}

function stopAmbientGlitch() {
  if (ambientGlitchTimer) clearTimeout(ambientGlitchTimer);
  ambientGlitchTimer = null;
}

function triggerNoise(duration = 600) {
  const canvas = $("#noise-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  canvas.style.opacity = "1";
  let frames = Math.ceil(duration / 50);
  function drawFrame() {
    if (frames <= 0) {
      canvas.style.opacity = "0";
      return;
    }
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = Math.random() > 0.25 ? 22 : 0;
    }
    ctx.putImageData(imgData, 0, 0);
    frames--;
    setTimeout(drawFrame, 50);
  }
  drawFrame();
}

function tone(
  frequency,
  start,
  duration,
  type = "sine",
  volume = 0.08,
  destination = null,
) {
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
  const buffer = audioContext.createBuffer(
    1,
    audioContext.sampleRate * duration,
    audioContext.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1)
    data[index] = Math.random() * 2 - 1;
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
  notes.forEach((note, index) =>
    tone(note, now + index * 0.22, 0.9, "triangle", 0.08),
  );
}

function playVoteSound() {
  if (!soundEnabled || !audioContext) return;
  const now = audioContext.currentTime;
  noise(now, 0.06, 0.02);
  tone(660, now, 0.04, "square", 0.015);
}

function playDefenseSound() {
  if (!soundEnabled || !audioContext) return;
  const now = audioContext.currentTime;
  tone(55, now, 0.8, "sawtooth", 0.03);
  tone(110, now + 0.1, 0.5, "triangle", 0.02);
}

function showToast(message, type = "") {
  const container = $("toast-container");
  container.innerHTML = "";
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 200);
  }, 2800);
}

function triggerRoleCardReveal(role) {
  const filename = ROLE_CARD_IMAGES[role];
  if (!filename) return;
  const img = $("card-role-image");
  const miniImg = $("mini-card-image");
  const src = `/images/${filename}.png`;
  img.src = src;
  miniImg.src = src;
  img.alt = state.roleInfo[role]?.name || role;

  const reveal = $("role-card-reveal");
  const flipper = $("card-flipper");
  const container = $("card-container");

  reveal.classList.remove("shrink");
  flipper.classList.remove("flipped");
  void reveal.offsetWidth;

  reveal.classList.add("active");

  const flipTimeout = setTimeout(() => {
    flipper.classList.add("flipped");
  }, 600);

  const shrinkTimeout = setTimeout(() => {
    reveal.classList.add("shrink");
  }, 2200);

  const hideTimeout = setTimeout(() => {
    reveal.classList.remove("active", "shrink");
    $("mini-card").classList.remove("hidden");
  }, 3200);

  const cleanup = () => {
    clearTimeout(flipTimeout);
    clearTimeout(shrinkTimeout);
    clearTimeout(hideTimeout);
  };

  reveal._cleanup = cleanup;
  reveal.addEventListener("click", () => {
    if (reveal.classList.contains("active") && !reveal.classList.contains("shrink")) {
      cleanup();
      reveal.classList.remove("active");
      $("mini-card").classList.remove("hidden");
    }
  }, { once: true });
}

function renderIdentity() {
  const role = state.me?.role;
  const roleName = $("role-name");
  const roleDesc = $("role-desc");
  const roleFlavor = $("role-flavor");
  if (role) {
    if (role !== previousRole && previousRole !== undefined) {
      roleName.className = "role-reveal";
      roleDesc.className = "role-reveal";
      roleFlavor.className = "role-reveal";
      if (state.roleInfo[role].team !== "village")
        roleName.classList.add("is-demon");
      setTimeout(() => {
        roleName.classList.remove("role-reveal", "is-demon");
        roleDesc.classList.remove("role-reveal");
        roleFlavor.classList.remove("role-reveal");
      }, 700);
    }
    if (!roleCardRevealed) {
      roleCardRevealed = true;
      triggerRoleCardReveal(role);
    }
    previousRole = role;
  } else {
    roleName.classList.remove("is-demon");
  }
  roleName.textContent = role
    ? `${state.roleInfo[role].icon || ""} ${state.roleInfo[role].name}`
    : "Game chưa bắt đầu";
  roleDesc.textContent =
    state.me?.description || "Chờ chủ phòng bắt đầu trò chơi.";
  roleFlavor.textContent = state.me?.flavor ? `"${state.me.flavor}"` : "";
  const bits = [];
  const cupidPair = state.me?.cupidPair
    ?.map((id) => state.players.find((p) => p.id === id)?.name)
    .filter(Boolean);
  if (state.me?.role === "cupid" && cupidPair?.length === 2)
    bits.push(`Hai người đã ghép đôi: ${cupidPair.join(" và ")}`);
  if (state.me?.role === "springroll" && state.me.alive)
    bits.push(`Số mạng còn lại: ${state.me.health}`);
  if (state.villagePowersDisabled && state.roleInfo[role]?.team === "village")
    bits.push("Lời nguyền Chá Giò đã kích hoạt: phe dân không còn kỹ năng.");
  if (state.me?.priestChurch?.length)
    bits.push(`Nhà Thờ (${state.me.priestChurch.length} người): ${
      state.me.priestChurch.map((id) => state.players.find((p) => p.id === id)?.name).filter(Boolean).join(", ")
    }`);
  const mates = state.players.filter((p) => p.id !== state.me?.id && p.isWolf);
  if (mates.length)
    bits.push(`Các Quỷ cùng thức dậy: ${mates.map((p) => p.name).join(", ")}`);
  if (state.seerResult)
    bits.push(
      `${state.seerResult.targetName}: ${state.seerResult.alignment === "bad" ? "XẤU" : "TỐT"}`,
    );
  $("private-info").innerHTML = bits
    .map((x) => `<p>${escapeHtml(x)}</p>`)
    .join("");
}

function renderPlayers() {
  $("player-count").textContent =
    `${state.players.filter((p) => p.alive).length}/${state.players.length} còn sống`;
  const blankVoters = new Set(state.blankVoters || []);
  const sorted = [...state.players].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const maxVotes = Math.max(
    0,
    ...Object.values(state.votesByTarget || {}).map((v) => v.length),
  );
  const leadingIds = maxVotes
    ? new Set(
        Object.entries(state.votesByTarget || {})
          .filter(([, v]) => v.length === maxVotes)
          .map(([id]) => id),
      )
    : new Set();
  const alivePlayers = sorted.filter((p) => p.alive);
  const deadPlayers = sorted.filter((p) => !p.alive);
  const card = (p) => {
    let dot = "";
    if (p.alive && state.phase === "night") {
      dot = `<span class="waiting-dot night-dot"></span>`;
    }
    return `
    <div class="player ${p.alive ? "" : "dead"} ${p.id === state.me?.id ? "me" : ""} ${leadingIds.has(p.id) ? "leading" : ""}" data-id="${p.id}">
      ${renderSigil(p)}
      <div class="player-copy"><strong>${escapeHtml(p.name)}${p.id === state.me?.id ? " (bạn)" : ""}</strong>
      <small>${p.role ? state.roleInfo[p.role].name : p.isWolf ? "Quỷ" : p.connected ? (p.alive ? "Còn sống" : "Đã chết") : "Mất kết nối"}</small>
      </div>${dot}<span class="status-dot"></span>
      ${blankVoters.has(p.id) ? '<span class="white-flag" title="Đã bỏ phiếu trắng">⚑</span>' : ""}
      ${renderVotesFor(p.id)}
    </div>`;
  };
  $("players").innerHTML = `
    <div class="player-group">
      <div class="player-group-header">Còn sống <span class="count">${alivePlayers.length}</span></div>
      ${alivePlayers.map(card).join("")}
    </div>
    ${
      deadPlayers.length
        ? `
    <div class="player-group">
      <div class="player-group-header">Đã chết <span class="count">${deadPlayers.length}</span></div>
      ${deadPlayers.map(card).join("")}
    </div>`
        : ""
    }`;
}

function renderVotesFor(targetId) {
  const voterIds = state.votesByTarget?.[targetId] || [];
  if (!voterIds.length) return "";
  const voters = voterIds
    .map((id) => state.players.find((player) => player.id === id))
    .filter(Boolean);
  return `<div class="vote-stack"><b>${voters.length}</b>${voters.map((player) => renderSigil(player, true)).join("")}</div>`;
}

function renderSigil(player, mini = false) {
  const index = Math.max(
    0,
    state.players.findIndex((candidate) => candidate.id === player.id),
  );
  const rotation = ((index * 47) % 90) - 45;
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
  if (action?.type === "verdict") {
    $("action-title").textContent = `${state.accusedName} đang chờ phán quyết`;
    $("action-help").textContent =
      `Giết ${state.verdicts.kill} · Tha ${state.verdicts.spare}. Chỉ sống khi phiếu Tha nhiều hơn phiếu Giết.`;
    $("witch-actions").innerHTML = `
      <button data-verdict="kill" class="verdict-kill ${action.currentVerdict === "kill" ? "active" : ""}">Giết <strong>${state.verdicts.kill}</strong></button>
      <button data-verdict="spare" class="verdict-spare ${action.currentVerdict === "spare" ? "active" : ""}">Tha <strong>${state.verdicts.spare}</strong></button>`;
    document.querySelectorAll("[data-verdict]").forEach((button) => {
      button.onclick = () => submit(button.dataset.verdict);
    });
    return;
  }
  if (!action) {
    if (state.phase === "defense") {
      $("action-title").textContent =
        state.me.id === state.accusedId
          ? "Bạn đang bị buộc tội"
          : `${state.accusedName} đang phản biện`;
      $("action-help").textContent =
        state.me.id === state.accusedId
          ? "Bạn có 30 giây để thuyết phục khu phố chọn Tha."
          : "Hãy chờ những người còn sống đưa ra phán quyết.";
    } else if (state.phase === "hunter") {
      $("action-title").textContent = `${state.hunterRevealName} là Lọ Vương`;
      $("action-help").textContent = "Hãy chờ Lọ Vương chọn người chết chung.";
    } else {
      $("action-title").textContent =
        state.phase === "lobby" ? "Chờ đủ người" : "Hãy chờ...";
      $("action-help").textContent =
        state.phase === "day"
          ? "Thời gian bỏ phiếu vẫn đang diễn ra."
          : "Những người có kỹ năng đang hành động.";
    }
    return;
  }
  $("action-title").textContent = action.label;
  $("action-help").textContent = action.betrayalOnly
    ? "Không còn con mồi cho đàn. Hãy bí mật thủ tiêu một thành viên phe Quỷ."
    : action.betrayal
      ? "Đầu tiên chọn con mồi của đàn, sau đó chọn một thành viên phe Quỷ để bí mật thủ tiêu."
      : action.type === "wolf-vote"
        ? "Mỗi Quỷ bỏ một phiếu. Mục tiêu có nhiều phiếu nhất sẽ bị liếm; hòa phiếu thì không ai chết."
        : action.count === 2
          ? "Chọn đúng hai người."
          : "Chạm vào một người để chọn.";
  if (action.type === "witch") renderWitch(action);
  else renderTargets(action);
  if (action.allowSkip) {
    $("skip-action").classList.remove("hidden");
    $("skip-action").textContent =
      action.type === "vote" ? "Bỏ phiếu trắng" : "Bỏ qua";
    $("skip-action").onclick = () => submit("skip");
  }
}

function eligible(action, player) {
  if (!player.alive) return false;
  if (action.exclude?.includes(player.id)) return false;
  if (action.type === "priest" && state.me?.priestChurch?.includes(player.id)) return false;
  const isWolf =
    player.isWolf ||
    (player.role &&
      ["demon", "loner"].includes(state.roleInfo[player.role]?.team));
  if (action.betrayal) {
    if (selected.length === 0) return !isWolf;
    return (
      selected.includes(player.id) || (isWolf && player.id !== state.me.id)
    );
  }
  if (action.betrayalOnly) return isWolf && player.id !== state.me.id;
  if (action.excludeRegularWolf && isWolf) return false;
  if (action.excludeWolf && isWolf) return false;
  if (
    action.type === "witch" &&
    witchMode === "poison" &&
    player.id === state.me.id
  )
    return false;
  if (action.type === "hunter" && player.id === state.me.id) return false;
  return true;
}

function renderTargets(action) {
  if (!selected.length && action.currentTarget)
    selected = [action.currentTarget];
  const choices = state.players.filter((p) => eligible(action, p));
  $("targets").innerHTML = choices
    .map(
      (p) =>
        `<button class="target ${selected.includes(p.id) ? "selected" : ""}" data-id="${p.id}">${renderSigil(p, true)}<span><strong>${escapeHtml(p.name)}</strong><small>${p.id === state.me.id ? "Bạn" : "Còn sống"}</small></span></button>`,
    )
    .join("");
  document.querySelectorAll(".target").forEach(
    (el) =>
      (el.onclick = () => {
        const id = el.dataset.id;
        if (action.betrayal && selected[0] === id) selected = [];
        else if (action.betrayal && selected[1] === id)
          selected = [selected[0]];
        else if (selected.includes(id))
          selected = selected.filter((x) => x !== id);
        else if (selected.length < action.count) selected.push(id);
        else selected = [id];
        renderAction();
      }),
  );
  if (selected.length === action.count) {
    $("submit-action").classList.remove("hidden");
    $("submit-action").onclick = () => submit(null);
  }
}

function renderWitch(action) {
  const options = [];
  if (state.witch.save && action.victimId) {
    const victim = state.players.find((p) => p.id === action.victimId);
    options.push(
      `<button data-mode="save" class="${witchMode === "save" ? "active" : ""}">Cứu ${escapeHtml(victim?.name || "")}</button>`,
    );
  }
  if (state.witch.poison)
    options.push(
      `<button data-mode="poison" class="${witchMode === "poison" ? "active" : ""}">Dùng bùa hại</button>`,
    );
  $("witch-actions").innerHTML = options.join("");
  document.querySelectorAll("[data-mode]").forEach(
    (el) =>
      (el.onclick = () => {
        witchMode = el.dataset.mode;
        selected = [];
        renderAction();
      }),
  );
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
      showToast("Đã gửi hành động", "success");
      if (state.action?.type === "verdict")
        showToast(mode === "spare" ? "Đã chọn Tha" : "Đã chọn Giết", "success");
      if (state.action?.type === "vote") {
        playVoteSound();
        const targetId = selected[0];
        if (targetId) {
          const playerEl = document.querySelector(
            `.player[data-id="${targetId}"]`,
          );
          if (playerEl) {
            playerEl.classList.remove("vote-pop");
            void playerEl.offsetWidth;
            playerEl.classList.add("vote-pop");
          }
        }
      }
      const identity = $("identity");
      if (
        identity &&
        state.action?.type !== "vote" &&
        state.action?.type !== "verdict"
      ) {
        identity.classList.remove("action-flash");
        void identity.offsetWidth;
        identity.classList.add("action-flash");
      }
      selected = [];
      witchMode = null;
    }
  });
}

function renderLogs() {
  $("logs").innerHTML = [...state.logs]
    .reverse()
    .map(
      (log) => `<div class="log ${log.type}">${escapeHtml(log.message)}</div>`,
    )
    .join("");
}

function renderHost() {
  const panel = $("host-panel");
  if (!state.isHost || state.status !== "lobby")
    return panel.classList.add("hidden");
  panel.classList.remove("hidden");
  const teamLabels = { demon: "Quỷ", village: "Dân", loner: "Độc Hành" };
  const teamOrder = ["demon", "village", "loner"];
  const sorted = Object.entries(state.roles).sort(([a], [b]) => {
    const ta = state.roleInfo[a]?.team, tb = state.roleInfo[b]?.team;
    if (ta !== tb) return teamOrder.indexOf(ta) - teamOrder.indexOf(tb);
    return a.localeCompare(b);
  });
  $("role-config").innerHTML = sorted
    .map(([role, count]) => {
      const info = state.roleInfo[role];
      const max = role === "spirit" ? 1 : 20;
      const tag = teamLabels[info?.team] || "";
      return `<div class="role-control" data-role="${role}">
        <div class="role-label">
          <span class="role-label-icon">${info?.icon || "•"}</span>
          <span class="role-label-name">${info?.name || role}</span>
          ${tag ? `<span class="role-label-tag tag-${info.team}">${tag}</span>` : ""}
        </div>
        <div class="role-stepper">
          <button class="step-down" data-role="${role}" aria-label="Giảm">−</button>
          <span class="role-count" data-role="${role}">${count}</span>
          <button class="step-up" data-role="${role}" aria-label="Tăng" ${count >= max ? "disabled" : ""}>+</button>
        </div>
      </div>`;
    })
    .join("");
  $("role-total").textContent =
    `Tổng vai: ${Object.values(state.roles).reduce((a, b) => a + b, 0)} / ${state.players.length} người`;
  const emitRoles = (role, delta) => {
    const info = state.roleInfo[role];
    const max = role === "spirit" ? 1 : 20;
    const cur = state.roles[role] || 0;
    const next = Math.max(0, Math.min(max, cur + delta));
    if (next === cur) return;
    const roles = { ...state.roles, [role]: next };
    socket.emit("set-roles", roles);
  };
  document.querySelectorAll("#role-config .step-down").forEach((btn) =>
    btn.onclick = () => emitRoles(btn.dataset.role, -1));
  document.querySelectorAll("#role-config .step-up").forEach((btn) =>
    btn.onclick = () => emitRoles(btn.dataset.role, 1));
  const kickable = state.players.filter((player) => player.id !== state.me.id);
  $("kick-list").innerHTML = kickable.length
    ? kickable
        .map(
          (player) =>
            `<button class="kick-member" data-kick="${player.id}">Kick ${escapeHtml(player.name)}</button>`,
        )
        .join("")
    : "<small>Chưa có thành viên nào để kick.</small>";
  document.querySelectorAll("[data-kick]").forEach(
    (button) =>
      (button.onclick = () => {
        const player = state.players.find(
          (candidate) => candidate.id === button.dataset.kick,
        );
        if (!player || !window.confirm(`Kick ${player.name} khỏi phòng?`))
          return;
        socket.emit("kick-player", { playerId: player.id }, (res) => {
          if (res?.error) showError("host-error", res.error);
        });
      }),
  );
}

const roleParticles = new RoleParticles();

function setRoleParticles(role, phase) {
  roleParticles.setRole(role, phase);
}
document.addEventListener("DOMContentLoaded", () => roleParticles.init());

function RoleParticles() {
  let canvas, ctx, animId;
  let currentRole = null;
  let particles = [];
  let running = false;
  let lastFrame = 0;
  let resizeTimer = null;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const lowPower =
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const frameInterval = 1000 / (lowPower ? 15 : 24);
  const quality = lowPower ? 0.5 : 0.75;
  const animatedRoles = new Set([
    "__night__",
    "demon",
    "junior",
    "spirit",
    "witch",
    "cupid",
    "guard",
    "seer",
    "bisexual",
    "priest",
  ]);

  this.init = () => {
    canvas = $("#role-particles");
    if (!canvas) return;
    if (reducedMotion) {
      canvas.hidden = true;
      return;
    }
    ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    resize();
    window.addEventListener("resize", queueResize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    if (currentRole) start();
  };

  function queueResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  }

  function resize() {
    if (!canvas) return;
    canvas.width = Math.ceil(window.innerWidth * quality);
    canvas.height = Math.ceil(window.innerHeight * quality);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }

  function handleVisibility() {
    if (document.hidden) stopLoop();
    else if (currentRole) start();
  }

  function stopLoop() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    running = false;
  }

  function start() {
    if (running || !canvas || !ctx || document.hidden || reducedMotion) return;
    running = true;
    lastFrame = 0;
    animId = requestAnimationFrame(loop);
  }

  this.setRole = (role, phase) => {
    const requested = role || (phase === "night" ? "__night__" : "");
    const key = animatedRoles.has(requested) ? requested : "";
    if (key === currentRole) return;
    currentRole = key;
    particles = [];
    stopLoop();
    if (!key || !canvas || !ctx) return;
    start();
  };

  function loop(now) {
    animId = requestAnimationFrame(loop);
    if (now - lastFrame < frameInterval) return;
    lastFrame = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const count = particleCount();
    while (particles.length < count) particles.push(createParticle());
    while (particles.length > count) particles.pop();
    particles.forEach((p) => {
      update(p);
      draw(p);
    });
  }

  function particleCount() {
    const scale = lowPower ? 0.5 : 1;
    if (currentRole === "__night__") return Math.ceil(7 * scale);
    if (
      currentRole === "demon" ||
      currentRole === "junior" ||
      currentRole === "spirit"
    )
      return Math.ceil(11 * scale);
    if (currentRole === "witch") return Math.ceil(8 * scale);
    if (currentRole === "cupid") return Math.ceil(7 * scale);
    if (currentRole === "guard") return Math.ceil(6 * scale);
    if (currentRole === "seer") return Math.ceil(7 * scale);
    if (currentRole === "bisexual") return Math.ceil(8 * scale);
    if (currentRole === "priest") return Math.ceil(8 * scale);
    return 0;
  }

  function createParticle() {
    const w = canvas.width,
      h = canvas.height;
    const base = {
      x: Math.random() * w,
      y: h + 10,
      size: 2 + Math.random() * 4,
      speedY: -(0.3 + Math.random() * 0.8),
      speedX: (Math.random() - 0.5) * 0.5,
      life: 1,
      decay: 0.003 + Math.random() * 0.006,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.03,
    };
    if (currentRole === "__night__") {
      base.size = 6 + Math.random() * 10;
      base.decay = 0.002 + Math.random() * 0.004;
      base.speedY = -(0.08 + Math.random() * 0.2);
      base.speedX = (Math.random() - 0.5) * 0.15;
    } else if (
      currentRole === "demon" ||
      currentRole === "junior" ||
      currentRole === "spirit"
    ) {
      base.size = 3 + Math.random() * 5;
      base.decay = 0.004 + Math.random() * 0.008;
      base.speedX = (Math.random() - 0.5) * 0.3;
    } else if (currentRole === "witch") {
      base.size = 4 + Math.random() * 6;
      base.decay = 0.002 + Math.random() * 0.004;
      base.speedY = -(0.15 + Math.random() * 0.4);
    } else if (currentRole === "cupid") {
      base.size = 3 + Math.random() * 4;
      base.decay = 0.005 + Math.random() * 0.007;
      base.speedX = (Math.random() - 0.5) * 1.2;
    }
    return base;
  }

  function update(p) {
    p.life -= p.decay;
    p.x += p.speedX + Math.sin(p.wobble) * 0.5;
    p.y += p.speedY;
    p.wobble += p.wobbleSpeed;
    if (p.life <= 0 || p.y < -20) Object.assign(p, createParticle());
  }

  function draw(p) {
    if (!ctx || p.life <= 0) return;
    const alpha = p.life * 0.6;
    if (currentRole === "__night__") {
      ctx.fillStyle = `rgba(10, 5, 10, ${alpha * 0.08})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (currentRole === "demon") {
      ctx.fillStyle = `rgba(255, 45, 65, ${alpha * 0.48})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (currentRole === "junior") {
      ctx.fillStyle = `rgba(255, 145, 0, ${alpha * 0.45})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (currentRole === "spirit") {
      ctx.fillStyle = `rgba(177, 110, 220, ${alpha * 0.42})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (currentRole === "witch") {
      ctx.strokeStyle = `rgba(105, 240, 174, ${alpha * 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(105, 240, 174, ${alpha * 0.15})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (currentRole === "seer") {
      ctx.fillStyle = `rgba(179, 136, 255, ${alpha * 0.3})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (currentRole === "cupid") {
      ctx.fillStyle = `rgba(240, 98, 146, ${alpha * 0.35})`;
      drawHeart(ctx, p.x, p.y, p.size * 0.5);
    } else if (currentRole === "guard") {
      ctx.strokeStyle = `rgba(255, 215, 64, ${alpha * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, Math.PI, Math.PI * 1.5);
      ctx.stroke();
    } else if (currentRole === "bisexual") {
      const gradient = ctx.createLinearGradient(p.x - p.size, p.y, p.x + p.size, p.y);
      gradient.addColorStop(0, `rgba(255, 45, 65, ${alpha * 0.5})`);
      gradient.addColorStop(0.5, `rgba(150, 80, 255, ${alpha * 0.5})`);
      gradient.addColorStop(1, `rgba(70, 130, 255, ${alpha * 0.5})`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (currentRole === "priest") {
      ctx.fillStyle = `rgba(255, 215, 0, ${alpha * 0.3})`;
      ctx.beginPath();
      const s = p.size;
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x + s * 0.6, p.y + s * 0.4);
      ctx.lineTo(p.x - s * 0.6, p.y + s * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawHeart(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.3);
    ctx.bezierCurveTo(
      x - size,
      y - size * 0.3,
      x - size * 0.5,
      y - size,
      x,
      y - size * 0.5,
    );
    ctx.bezierCurveTo(
      x + size * 0.5,
      y - size,
      x + size,
      y - size * 0.3,
      x,
      y + size * 0.3,
    );
    ctx.fill();
  }

  this.stop = () => {
    stopLoop();
    particles = [];
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
}
