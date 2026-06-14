const AVATAR_COUNT = 30;

function isValidAvatarId(value) {
  return Number.isInteger(value) && value >= 0 && value < AVATAR_COUNT;
}

function firstAvailableAvatar(players, excludedPlayerId = null) {
  const used = new Set(
    players
      .filter((player) => player.id !== excludedPlayerId)
      .map((player) => player.avatarId)
      .filter(isValidAvatarId),
  );
  for (let avatarId = 0; avatarId < AVATAR_COUNT; avatarId += 1) {
    if (!used.has(avatarId)) return avatarId;
  }
  return null;
}

function ensureUniqueAvatars(players) {
  const used = new Set();
  players.forEach((player) => {
    if (isValidAvatarId(player.avatarId) && !used.has(player.avatarId)) {
      used.add(player.avatarId);
      return;
    }
    let avatarId = 0;
    while (avatarId < AVATAR_COUNT && used.has(avatarId)) avatarId += 1;
    player.avatarId = avatarId < AVATAR_COUNT ? avatarId : 0;
    used.add(player.avatarId);
  });
}

module.exports = {
  AVATAR_COUNT,
  isValidAvatarId,
  firstAvailableAvatar,
  ensureUniqueAvatars,
};
