const ROLE_INFO = {
  demon: {
    name: "Quỷ Liếm",
    team: "demon",
    icon: "⛧",
    description:
      "Mỗi đêm chọn một người để liếm đít. Sáng hôm sau người đó biến mất.",
    flavor:
      "Một bóng đen từ địa ngục. Ngươi là nỗi khiếp sợ của cả khu phố. Hãy săn mồi!",
  },
  spirit: {
    name: "Quỷ Liếm Tinh",
    team: "loner",
    icon: "☩",
    description:
      "Cùng đàn Quỷ săn mồi mỗi đêm. Vào đêm 3, 6, 9..., được bí mật giết thêm một thành viên phe Quỷ. Chỉ thắng khi là người duy nhất còn sống.",
    flavor:
      "Ngươi thức cùng đàn, săn cùng đàn, nhưng chưa từng thuộc về đàn. Chiếc ngai cuối cùng chỉ đủ chỗ cho một kẻ.",
  },
  seer: {
    name: "Cô Bé Hay Đoán",
    team: "village",
    icon: "◈",
    description:
      "Mỗi đêm soi một người và chỉ biết họ thuộc phe Tốt hay phe Xấu.",
    flavor:
      "Đôi mắt tinh anh nhìn thấu linh hồn. Sự thật không thể che giấu trước ánh nhìn của em.",
  },
  witch: {
    name: "Cậu Bé Chơi Bùa",
    team: "village",
    icon: "⚗",
    description: "Có một bùa cứu và một bùa hại, mỗi bùa chỉ dùng một lần.",
    flavor:
      "Những lọ thuốc bí ẩn chứa sức mạnh sinh tử. Một giọt cứu sống, một giọt hủy diệt.",
  },
  guard: {
    name: "Gã Béo Nóng Tính",
    team: "village",
    icon: "⛨",
    description:
      "Bảo kê một người khỏi Quỷ Liếm, kể cả bản thân. Sau mỗi lần bảo vệ phải nghỉ một đêm.",
    flavor:
      "Thân hình to lớn che chắn cho khu phố. Không một con quỷ nào qua được vòng tay gã.",
  },
  villager: {
    name: "Anh Hàng Xóm",
    team: "village",
    icon: "◇",
    description: "Không có kỹ năng đặc biệt. Hãy thảo luận và biểu quyết.",
    flavor:
      "Một người dân bình thường. Nhưng chính những người bình thường tạo nên sức mạnh của khu phố.",
  },
  springroll: {
    name: "Chá Giò",
    team: "village",
    icon: "☥",
    description:
      "Có hai mạng. Mạng đầu không thể được cứu hay bảo vệ, mạng cuối có thể được cứu hoặc bảo vệ. Khi chết hẳn, tất cả phe dân mất kỹ năng.",
    flavor:
      "Lớp vỏ giòn che giấu một lời nguyền. Khi lớp vỏ cuối cùng vỡ vụn, hy vọng của khu phố cũng tắt theo.",
  },
  hunter: {
    name: "Lọ Vương",
    team: "village",
    icon: "☠",
    description:
      "Khi bị Quỷ Liếm giết hoặc bị treo cổ, kéo theo một người xuống mồ.",
    flavor:
      "Một kẻ liều mạng. Ngươi không sợ chết, và sẽ kẻ theo một kẻ khác khi lâm chung.",
  },
  cupid: {
    name: "Người Yêu Cũ",
    team: "loner",
    icon: "♡",
    description:
      "Đêm đầu ghép đôi hai người. Một người chết, người kia chết theo.",
    flavor:
      "Trái tim cô đơn giữa khu phố hoang tàn. Hãy se duyên cho hai số phận, dù kết cục có ra sao.",
  },
  junior: {
    name: "Quỷ Liếm Nhí",
    team: "demon",
    icon: "⧩",
    description: "Chỉ được săn mồi khi tất cả Quỷ Liếm trưởng thành đã chết.",
    flavor:
      "Kẻ học việc của Quỷ Liếm. Nhỏ nhưng nguy hiểm. Chờ đến lượt mình ra tay.",
  },
  bisexual: {
    name: "Gay Lỏ",
    team: "loner",
    icon: "⚥",
    description:
      "Phe Độc Hành nhưng bị soi là Xấu. Khi bị Quỷ Liếm cắn sẽ không chết mà gia nhập đàn Quỷ.",
    flavor:
      "Một linh hồn đứng giữa ranh giới ánh sáng và bóng tối. Khi tử thần gõ cửa, ngươi sẽ mở cánh cửa cho bóng đêm.",
  },
  thangngoo: {
    name: "Thằng Ngoo",
    team: "loner",
    icon: "☺",
    description:
      "Nếu bị treo cổ, Thằng Ngoo thắng ngay lập tức. Thuộc Phe Độc Hành.",
    flavor:
      "Một kẻ ngây ngô, nhưng có một nụ cười bí ẩn. Liệu khu phố có dám treo cổ người này?",
  },
  priest: {
    name: "Cha Sứ",
    team: "loner",
    icon: "♱",
    description:
      "Mỗi đêm thêm 2 người vào Nhà Thờ của mình. Thắng khi tất cả người còn sống đều trong Nhà Thờ.",
    flavor:
      "Dưới ánh nến leo lét, Cha Sứ thì thầm lời nguyện cầu. Những linh hồn lạc lối sẽ tìm thấy nơi trú ẩn trong vòng tay ngài.",
  },
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
