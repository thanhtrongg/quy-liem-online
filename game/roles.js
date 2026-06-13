const ROLE_INFO = {
  demon: { name: "Quỷ Liếm", team: "demon", icon: "⛧", description: "Mỗi đêm chọn một người để liếm đít. Sáng hôm sau người đó biến mất.", flavor: "Một bóng đen từ địa ngục. Ngươi là nỗi khiếp sợ của cả khu phố. Hãy săn mồi!" },
  seer: { name: "Cô Bé Hay Đoán", team: "village", icon: "◈", description: "Mỗi đêm soi một người và chỉ biết họ thuộc phe Tốt hay phe Xấu.", flavor: "Đôi mắt tinh anh nhìn thấu linh hồn. Sự thật không thể che giấu trước ánh nhìn của em." },
  witch: { name: "Cậu Bé Chơi Bùa", team: "village", icon: "⚗", description: "Có một bùa cứu và một bùa hại, mỗi bùa chỉ dùng một lần.", flavor: "Những lọ thuốc bí ẩn chứa sức mạnh sinh tử. Một giọt cứu sống, một giọt hủy diệt." },
  guard: { name: "Gã Béo Nóng Tính", team: "village", icon: "⛨", description: "Mỗi đêm bảo kê một người khỏi Quỷ Liếm.", flavor: "Thân hình to lớn che chắn cho khu phố. Không một con quỷ nào qua được vòng tay gã." },
  villager: { name: "Anh Hàng Xóm", team: "village", icon: "◇", description: "Không có kỹ năng đặc biệt. Hãy thảo luận và biểu quyết.", flavor: "Một người dân bình thường. Nhưng chính những người bình thường tạo nên sức mạnh của khu phố." },
  hunter: { name: "Lọ Vương", team: "village", icon: "☠", description: "Khi chết, kéo theo một người xuống mồ.", flavor: "Một kẻ liều mạng. Ngươi không sợ chết, và sẽ kẻ theo một kẻ khác khi lâm chung." },
  cupid: { name: "Người Yêu Cũ", team: "village", icon: "♡", description: "Đêm đầu ghép đôi hai người. Một người chết, người kia chết theo.", flavor: "Trái tim cô đơn giữa khu phố hoang tàn. Hãy se duyên cho hai số phận, dù kết cục có ra sao." },
  junior: { name: "Quỷ Liếm Nhí", team: "demon", icon: "⧩", description: "Chỉ được săn mồi khi tất cả Quỷ Liếm trưởng thành đã chết.", flavor: "Kẻ học việc của Quỷ Liếm. Nhỏ nhưng nguy hiểm. Chờ đến lượt mình ra tay." }
};

function isDemon(role) {
  return ROLE_INFO[role]?.team === "demon";
}

function isVillage(role) {
  return ROLE_INFO[role]?.team === "village";
}

module.exports = { ROLE_INFO, isDemon, isVillage };
