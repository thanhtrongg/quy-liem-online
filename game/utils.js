const cleanName = (value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
const randomCode = () => {
  let code;
  do code = Math.random().toString(36).slice(2, 7).toUpperCase();
  while (false);
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

module.exports = { cleanName, randomCode, shuffle, getPlayer, alive, addLog };
