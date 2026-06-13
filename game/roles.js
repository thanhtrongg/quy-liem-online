const ROLE_INFO = {
  demon: { name: "Quỷ Liếm", team: "demon", icon: "⛧", description: "Mỗi đêm thức dậy cùng Quỷ Liếm Nhí và bỏ phiếu chọn con mồi. Mục tiêu có nhiều phiếu nhất sẽ bị liếm.", flavor: "Một bóng đen từ địa ngục. Trong tiếng thì thầm của đàn Quỷ, lá phiếu của ngươi quyết định ai sẽ biến mất trước bình minh." },
  spirit: { name: "Quỷ Liếm Tinh", team: "loner", icon: "♱", description: "Thức dậy riêng và biết ai là Quỷ thường. Vào đêm 3, 6, 9..., được giết một Quỷ thường. Chỉ thắng khi là người duy nhất còn sống.", flavor: "Ngươi quan sát đàn Quỷ từ ngoài bóng tối. Chúng không biết ngươi là ai, nhưng từng cái tên của chúng đều đã nằm trong danh sách săn mồi." },
  seer: { name: "Cô Bé Hay Đoán", team: "village", icon: "◈", description: "Mỗi đêm soi một người và chỉ biết họ thuộc phe Tốt hay phe Xấu.", flavor: "Đôi mắt tinh anh nhìn thấu linh hồn. Sự thật không thể che giấu trước ánh nhìn của em." },
  witch: { name: "Cậu Bé Chơi Bùa", team: "village", icon: "⚗", description: "Có một bùa cứu và một bùa hại, mỗi bùa chỉ dùng một lần. Bùa cứu không thể ngăn Chá Giò mất mạng đầu.", flavor: "Một tay giữ bùa hoàn sinh, tay kia nắm lời nguyền đoạt mạng. Nhưng có những lớp vỏ ngay cả phép cứu sinh cũng không thể giữ nguyên." },
  guard: { name: "Gã Béo Nóng Tính", team: "village", icon: "⛨", description: "Mỗi đêm bảo kê một người khỏi Quỷ Liếm, kể cả bản thân. Không thể bảo vệ cùng một người trong hai đêm liên tiếp.", flavor: "Đêm nào gã cũng đứng trước một cánh cửa, nhưng không bao giờ canh cùng một nơi hai đêm liền. Muốn quay lại, gã phải đổi mục tiêu trong một đêm." },
  villager: { name: "Anh Hàng Xóm", team: "village", icon: "◇", description: "Không có kỹ năng đặc biệt. Hãy thảo luận và biểu quyết.", flavor: "Một người dân bình thường. Nhưng chính những người bình thường tạo nên sức mạnh của khu phố." },
  springroll: { name: "Chá Giò", team: "village", icon: "▰", description: "Có hai mạng. Bảo vệ có thể chặn mọi cú liếm, nhưng bùa cứu không thể ngăn mất mạng đầu. Khi chết hẳn, toàn bộ phe dân mất kỹ năng.", flavor: "Hai lớp vỏ giữ lấy sinh mệnh và lời nguyền của khu phố. Khi lớp cuối cùng vỡ vụn, năng lực của mọi người dân cũng tắt theo." },
  hunter: { name: "Lọ Vương", team: "village", icon: "☠", description: "Khi bị Quỷ Liếm giết hoặc bị treo cổ, kéo theo một người xuống mồ.", flavor: "Một kẻ liều mạng. Ngươi không sợ chết, và sẽ kẻ theo một kẻ khác khi lâm chung." },
  cupid: { name: "Người Yêu Cũ", team: "loner", icon: "♡", description: "Thuộc Phe Độc Hành. Đêm đầu ghép đôi hai người; một người chết, người kia chết theo.", flavor: "Ngươi không đứng về phía khu phố hay đàn Quỷ. Ngươi chỉ muốn hai trái tim bị trói buộc phải cùng nhau đi đến tận cùng." },
  junior: { name: "Quỷ Liếm Nhí", team: "demon", icon: "⧩", description: "Mỗi đêm thức dậy cùng Quỷ Liếm và cùng bỏ phiếu chọn con mồi.", flavor: "Kẻ học việc nhỏ bé nhưng lá phiếu vẫn có sức nặng trong đàn. Hãy nhìn các Quỷ khác và chọn con mồi thật khôn ngoan." }
};

function isDemon(role) {
  return ROLE_INFO[role]?.team === "demon";
}

function isVillage(role) {
  return ROLE_INFO[role]?.team === "village";
}

function isWolf(role) {
  return ["demon", "junior", "spirit"].includes(role);
}

module.exports = { ROLE_INFO, isDemon, isVillage, isWolf };
