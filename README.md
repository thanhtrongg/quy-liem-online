<div align="center">

# QUỶ LIẾM ONLINE

### Game suy luận xã hội kinh dị — nơi mỗi màn đêm đều có thể là lần cuối

Tạo phòng, phân vai bí mật, sống sót qua màn đêm và tìm ra Quỷ Liếm trước khi quá muộn.

[![Node.js](https://img.shields.io/badge/Node.js-20+-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-111111?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)

[Bắt đầu](#bắt-đầu) · [Vai trò](#vai-trò) · [Luật chơi](#luật-chơi) · [Tính năng](#tính-năng) · [Deploy](#deploy)

</div>

---

## Tổng quan

**Quỷ Liếm Online** là game suy luận xã hội (Werewolf/Mafia) nhiều người chơi, chạy trực tiếp trên trình duyệt. Người chơi tham gia bằng mã phòng, nhận vai bí mật và thực hiện kỹ năng theo chu kỳ ngày đêm.

Server là nguồn dữ liệu duy nhất, đảm bảo không rò rỉ thông tin vai, hành động ban đêm hay kết quả soi cho người không liên quan.

## Bắt đầu

Yêu cầu: **Node.js 20+**

```bash
git clone https://github.com/thanhtrongg/quy-liem-online.git
cd quy-liem-online
npm install
npm start
```

Mở `http://localhost:3030` trên trình duyệt.

Chạy smoke test multiplayer tự động (không cần mở tab):

```bash
npm test
# hoặc với debug log:
DEBUG_SMOKE=true npm test
```

## Vai trò

### 🔴 Phe Quỷ Liếm (Demon)

| Vai | Icon | Chức năng |
| --- | :--: | --- |
| **Quỷ Liếm** | ⛧ | Mỗi đêm cùng đàn bỏ phiếu chọn nạn nhân. |
| **Quỷ Liếm Nhí** | ⧩ | Chỉ được săn mồi khi tất cả Quỷ Liếm trưởng thành đã chết. |

### 🔵 Phe Khu Phố (Village)

| Vai | Icon | Chức năng |
| --- | :--: | --- |
| **Cô Bé Hay Đoán** | ◈ | Mỗi đêm soi một người, biết phe Tốt hay Xấu. |
| **Cậu Bé Chơi Bùa** | ⚗ | Một bùa cứu, một bùa hại, mỗi bùa dùng một lần. |
| **Gã Béo Nóng Tính** | ⛨ | Mỗi đêm bảo kê một người khỏi Quỷ Liếm. |
| **Lọ Vương** | ☠ | Khi bị Quỷ giết hoặc treo cổ, kéo theo một người. |
| **Chá Giò** | ☥ | Hai mạng. Mất mạng cuối → toàn phe dân mất kỹ năng. |
| **Anh Hàng Xóm** | ◇ | Không kỹ năng, thảo luận và biểu quyết. |

### 🟣 Phe Độc Hành (Loner)

| Vai | Icon | Chức năng |
| --- | :--: | --- |
| **Quỷ Liếm Tinh** | ♱ | Biết đàn Quỷ. Đêm 3, 6, 9... được giết một Quỷ. Thắng khi là người cuối sống sót. |
| **Người Yêu Cũ** | ♡ | Đêm đầu ghép đôi; một người chết, người kia chết theo. |
| **Gay Lỏ** | ⚥ | Bị soi ra Xấu. Khi Quỷ cắn → không chết, gia nhập đàn Quỷ. |
| **Thằng Ngoo** | ☺ | Nếu bị treo cổ → thắng ngay lập tức. |
| **Cha Sứ** | ☩ | Mỗi đêm thêm 2 người vào Nhà Thờ. Thắng khi toàn bộ người sống trong Nhà Thờ. |

## Luật chơi

1. **Chuẩn bị**: Host tạo phòng, gửi mã. Host tùy chỉnh số lượng từng vai, sau đó bắt đầu.
2. **Ban đêm**: Các vai có kỹ năng lần lượt thức dậy và hành động bí mật theo thứ tự. Hành động được xử lý sau khi tất cả hoàn tất hoặc hết thời gian.
3. **Ban ngày**: Khu phố thảo luận, bỏ phiếu treo cổ. Phiếu trắng được tính. Hết giờ hoặc đủ phiếu → chuyển sang phản biện.
4. **Phản biện**: Người bị buộc tội có 30 giây. Khu phố bỏ phiếu Giết/Tha. Chỉ sống khi phiếu Tha nhiều hơn Giết.
5. **Chiến thắng**:
   - **Phe Quỷ**: Số Quỷ ≥ số dân, không còn Độc Hành.
   - **Phe Dân**: Tiêu diệt hết Quỷ và Độc Hành.
   - **Độc Hành**: Mỗi vai có điều kiện riêng (sống sót cuối cùng, treo cổ, thu phục toàn bộ,...).

## Tính năng

### Gameplay
- Phòng chơi realtime với mã 5 ký tự, hỗ trợ reconnect
- Host tùy chỉnh đội hình linh hoạt, kick thành viên, replay
- Voice chat theo kênh (phe Quỷ nói chuyện riêng ban đêm)
- Xử lý hàng loạt: tiên tri soi, bảo vệ, bùa cứu/hại, phản đòn Lọ Vương, chuỗi chết theo cặp tình nhân
- Tự động kiểm tra điều kiện thắng sau mỗi phase
- Đồng hồ đếm ngược với thanh timer (xanh → vàng → đỏ)
- Hiệu ứng drama 10 giây cuối

### Giao diện
- Sổ vai tra cứu chức năng từng phe
- Theme màu theo từng vai (CSS custom properties + body data attribute)
- Hiệu ứng chuyển phase (cinematic overlay, glitch RGB, static noise)
- Hiệu ứng chết: rung màn hình, máu bắn, lật bài tử vong
- Confetti khi kết thúc (vàng-xanh cho dân, đỏ-đen cho quỷ)
- Particle system riêng cho từng vai (lửa demon, bong bóng phù thủy, trái tim cupid, khiên guard, hào quang seer)
- Sương mờ ban đêm qua particle canvas
- Reveal animation danh tính (scale + fade)
- Scrollbar tùy chỉnh theo chủ đề máu
- Con trỏ chuột hình bàn tay máu
- Roleplay narrative: flavor text động theo từng tình huống
- End game role reveal: bảng hiển thị icon + vai + tên + trạng thái

### Âm thanh
- Nhạc nền kinh dị, âm thanh bỏ phiếu, tiếng rên phản biện
- Nút bật/tắt âm thanh và nhạc nền riêng

## Cấu trúc

```text
quy-liem-online/
├── public/
│   ├── cursor/          # Con trỏ chuột tùy chỉnh
│   ├── fonts/           # Font Việt hóa
│   ├── images/          # Background và hình ảnh
│   ├── sounds/          # Nhạc nền và hiệu ứng
│   ├── app.js           # Client logic (state render, particles, sound, voice)
│   ├── index.html
│   └── styles.css       # Theme, animation, responsive
├── game/
│   ├── roles.js         # Định nghĩa vai trò (ROLE_INFO)
│   ├── engine.js        # Logic game: đêm, ngày, vote, thắng/thua
│   ├── state.js         # Quản lý trạng thái public/client
│   ├── room.js          # Quản lý phòng, timer
│   ├── narrative.js     # Flavor text cho mọi tình huống
│   └── utils.js         # Hàm tiện ích (shuffle, cleanName,...)
├── tests/
│   └── smoke.js         # Smoke test multiplayer tự động
├── server.js            # Express + Socket.IO entry point
├── render.yaml          # Cấu hình Render Blueprint
└── package.json
```

## Deploy

### Render Blueprint

1. Fork repository này.
2. Mở [Render Dashboard](https://dashboard.render.com/).
3. Chọn **Blueprints** → **New Blueprint Instance**.
4. Chọn repository và nhấn **Deploy Blueprint**.

Render tự đọc [`render.yaml`](./render.yaml), cài dependencies và chạy `npm start`.

> [!IMPORTANT]
> Trạng thái phòng lưu trong RAM — chỉ nên chạy một instance. Dữ liệu sẽ mất khi server restart.

## Scripts

| Lệnh | Công dụng |
| --- | --- |
| `npm start` | Chạy server production |
| `npm run dev` | Chạy server với Node watch mode |
| `npm run check` | Kiểm tra cú pháp server và client |
| `npm test` | Chạy smoke test multiplayer |

## Công nghệ

- **Node.js + Express 5** — REST API + static files
- **Socket.IO 4** — Realtime đồng bộ phòng, voice signaling
- **WebRTC** — Voice chat ngang hàng
- **Vanilla HTML/CSS/JS** — Giao diện nhẹ, không framework
- **Web Audio API** — Hiệu ứng âm thanh động
- **Canvas 2D** — Particle system, noise effect

---

<div align="center">

**Khu phố đang yên bình. Hơi yên bình quá mức.**

</div>
