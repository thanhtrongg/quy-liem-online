function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const NIGHT_BEGIN = [
  "Khu phố chìm vào bóng tối. Những bóng đen bắt đầu cựa quậy...",
  "Màn đêm buông xuống. Ai đó sẽ không thấy bình minh.",
  "Tiếng côn trùng ngưng bặt. Có thứ gì đó đang di chuyển trong đêm.",
  "Bóng tối ôm trọn khu phố. Quỷ Liếm đã thức dậy.",
];

const NIGHT_END = [
  "Bình minh ló dạng. Khu phố từ từ tỉnh giấc sau một đêm dài.",
  "Ánh nắng đầu ngày chiếu rọi. Đêm đã qua, nhưng ai còn ở lại?",
  "Một ngày mới bắt đầu. Khu phố điểm danh những người còn sống.",
];

const DAY_BEGIN = [
  "Mọi người tập trung giữa quảng trường. Hôm nay ai sẽ bị đem lên đoạn đầu đài?",
  "Bỏ phiếu bắt đầu! Hãy chỉ ra kẻ khả nghi nhất.",
  "Khu phố xôn xao. Những lời buộc tội bắt đầu vang lên.",
];

const DEFENSE_BEGIN = [
  "Người bị buộc tội đứng trước đám đông. Lời nói cuối cùng trước khi quyết định được đưa ra.",
  "Cả khu phố im lặng lắng nghe. Đây là cơ hội cuối cùng để chứng minh sự vô tội.",
  "Những ánh mắt đổ dồn về phía bị cáo. Sự thật sắp được phơi bày.",
];

const VOTE_TIE = [
  "Khu phố chia rẽ! Cuộc bỏ phiếu hòa. Màn đêm sẽ phân xử thay.",
  "Không ai đủ phiếu. Bóng tối sẽ là người phán quyết cuối cùng.",
];

const VOTE_BLANK = [
  "Im lặng bao trùm quảng trường. Không ai dám lên tiếng buộc tội.",
  "Mọi người nhìn nhau. Sự im lặng đáng sợ hơn bất kỳ lời buộc tội nào.",
];

const VOTE_WITHDRAW = [
  "{name} đã rút lại lời buộc tội. Lương tâm hay sợ hãi?",
  "{name} do dự. Có điều gì đó khiến người này thay đổi quyết định.",
];

const VOTE_ACQUITTED = [
  "Mọi người đã rút phiếu. {name} được tha bổng. Lần này may mắn đã mỉm cười.",
  "{name} thở phào nhẹ nhõm. Bản án tử đã được hủy bỏ vào phút chót.",
];

const DEATH_DEMON = [
  "Trong đêm, {name} đã bị một bóng đen kéo vào hẻm tối. Sáng ra chỉ còn lại dấu giày.",
  "{name} không bao giờ thức dậy nữa. Một nụ cười ma quái trên môi người chết.",
  "Tiếng thét xé màn đêm. {name} đã biến mất không dấu vết.",
  "{name} bị tìm thấy trong ngõ cụt. Cổ họng có dấu răng kỳ lạ.",
];

const DEATH_HANG = [
  "Khu phố đã phán quyết. {name} bị treo cổ giữa quảng trường.",
  "{name} nhận bản án tử từ chính những người mình từng tin tưởng.",
  "Tiếng trống vang lên. {name} bị dẫn lên đoạn đầu đài.",
];

const DEATH_WITCH = [
  "{name} bỗng nhiên đổ gục. Một lọ thuốc màu tím đã làm nhiệm vụ của nó.",
  "{name} ôm bụng quằn quại. Chất độc đã ngấm vào máu.",
  "Một mùi thảo mộc kỳ lạ thoảng qua. {name} từ từ gục xuống.",
];

const DEATH_HUNTER = [
  "{name} bị Lọ Vương kéo xuống địa ngục. Mạng đền mạng.",
  "Lọ Vương đã chọn {name} để đi cùng về thế giới bên kia.",
];

const DEATH_LOVER = [
  "{name} không thể sống thiếu người yêu. Trái tim tan vỡ, hơi thở ngừng lại.",
  "Tin dữ đến với {name}. Người đó lặng lẽ ra đi theo người yêu.",
  "Tình yêu vượt qua cả cái chết. {name} đã chọn không ở lại một mình.",
];

const NIGHT_PEACEFUL = [
  "Đêm qua yên tĩnh lạ thường. Quá yên tĩnh để có thể an tâm.",
  "Không một tiếng động. Không một dấu hiệu. Một đêm bình yên đến đáng sợ.",
];

const NIGHT_UNREST = [
  "Đêm qua khu phố rung chuyển. Những bóng đen đã hành động.",
  "Máu đã đổ trong đêm. Khu phố không còn an toàn nữa.",
  "Những tiếng bước chân trong đêm. Sáng ra, người ta tìm thấy thi thể.",
];

const LOVER_PAIRED = [
  "Hai trái tim đã được se duyên. Số phận của họ giờ đây gắn chặt với nhau.",
  "Tình yêu nảy nở giữa khu phố chết chóc. Liệu họ có vượt qua được bóng tối?",
];

const SEER_FOUND_EVIL = [
  "Bói bài cho thấy linh hồn đen tối. {name} không phải là người!",
  "{name} mang một luồng khí lạnh lẽo. Ánh mắt của kẻ thù không thể che giấu.",
  "Những lá bài lật ngửa. Định mệnh chỉ rõ {name} là Quỷ!",
];

const SEER_FOUND_GOOD = [
  "Hào quang của {name} trong sáng. Người này vô tội.",
  "Trái tim {name} thuần khiết. Không một bóng tối nào che phủ.",
  "Bói bài không tìm thấy dấu hiệu xấu. {name} an toàn.",
];

const WIN_VILLAGE = [
  "Phe khu phố đã chiến thắng! Bóng tối bị đẩy lùi, bình minh lại về.",
  "Ánh sáng đã chiến thắng! Khu phố không còn bóng Quỷ Liếm nào.",
  "Cả khu phố ăn mừng! Những con quỷ đã bị tiêu diệt hoàn toàn.",
];

const WIN_DEMON = [
  "Phe Quỷ Liếm đã nuốt chửng khu phố! Bóng tối mãi mãi ngự trị.",
  "Màn đêm vĩnh cửu bao phủ. Quỷ Liếm đã chiến thắng!",
  "Không một ai sống sót. Khu phố giờ đây là lãnh địa của Quỷ Liếm.",
];

const WIN_LONER = [
  "Quỷ Liếm Tinh đứng một mình giữa khu phố im lặng. Phe Độc Hành đã chiến thắng.",
  "Đàn Quỷ và khu phố đều đã biến mất. Chỉ còn Quỷ Liếm Tinh trên chiếc ngai cuối cùng.",
];

const WITCH_SAVE = [
  "Một luồng sáng xanh bao bọc lấy nạn nhân. Tử thần đã bị đẩy lùi.",
  "Người đó suýt chết, nhưng một bàn tay từ bóng tối đã kéo họ về.",
];

const GUARD_PROTECT = [
  "Gã Béo Nóng Tính đã canh gác suốt đêm. Không ai có thể lại gần người được bảo vệ.",
  "Một tiếng la hét vang lên rồi tắt lịm. Gã Béo đã đuổi được kẻ lạ mặt.",
];

const BISEXUAL_CONVERT = [
  "{name} bị Quỷ Liếm cắn, nhưng thay vì chết, một luồng khí đen bao trùm. {name} đã gia nhập đàn Quỷ!",
  "Nanh Quỷ cắm vào cổ {name}. Đôi mắt mở ra đỏ rực — một con Quỷ mới đã thức tỉnh!",
  "{name} gục xuống, rồi đứng dậy với nụ cười tà. Ranh giới giữa người và quỷ đã bị phá vỡ.",
];

const PRIEST_CHURCH = [
  "{name} đã tìm thấy ánh sáng. Một linh hồn nữa gia nhập Nhà Thờ.",
  "Tiếng chuông nhà thờ vang lên. {name} bước qua cánh cửa thiêng liêng.",
  "Cha Sứ thì thầm lời nguyện. {name} quỳ xuống và đón nhận ánh sáng.",
];

const WIN_FOOL = [
  "Thằng Ngoo bị treo cổ — nhưng nụ cười vẫn nở trên môi. Kẻ ngốc đã thắng! Tất cả đều rơi vào bẫy.",
  "Khu phố nghĩ mình đã treo cổ đúng người. Nhưng Thằng Ngoo cười to nhất. Phe Độc Hành chiến thắng!",
  "Dây thừng siết chặt, nhưng Thằng Ngoo cười. Kết cục này chính là điều hắn mong đợi.",
];

module.exports = {
  pick,
  NIGHT_BEGIN,
  NIGHT_END,
  DAY_BEGIN,
  DEFENSE_BEGIN,
  VOTE_TIE,
  VOTE_BLANK,
  VOTE_WITHDRAW,
  VOTE_ACQUITTED,
  DEATH_DEMON,
  DEATH_HANG,
  DEATH_WITCH,
  DEATH_HUNTER,
  DEATH_LOVER,
  NIGHT_PEACEFUL,
  NIGHT_UNREST,
  LOVER_PAIRED,
  SEER_FOUND_EVIL,
  SEER_FOUND_GOOD,
  WIN_VILLAGE,
  WIN_DEMON,
  WIN_LONER,
  WITCH_SAVE,
  GUARD_PROTECT,
  BISEXUAL_CONVERT,
  PRIEST_CHURCH,
  WIN_FOOL,
};
