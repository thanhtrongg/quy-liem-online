<div align="center">

# QUỶ LIẾM ONLINE

### Game suy luận xã hội kinh dị dành cho những khu phố không bao giờ thật sự yên bình

Tạo phòng, phân vai bí mật, sống sót qua màn đêm và tìm ra Quỷ Liếm trước khi quá muộn.

[![Node.js](https://img.shields.io/badge/Node.js-20+-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-111111?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![Render](https://img.shields.io/badge/Deploy-Render-5A3FFF?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)

[Bắt đầu](#bắt-đầu) · [Tính năng](#tính-năng) · [Các vai](#các-vai) · [Luật chơi](#luật-chơi) · [Deploy](#deploy)

</div>

---

## Tổng quan

**Quỷ Liếm Online** là game suy luận xã hội multiplayer chạy trực tiếp trên trình duyệt. Người chơi tham gia bằng mã phòng, nhận vai bí mật và thực hiện kỹ năng theo chu kỳ ngày đêm.

Server là nguồn dữ liệu duy nhất, giúp giữ kín vai, lựa chọn ban đêm và thông tin cặp đôi khỏi những người không liên quan.

## Tính năng

- Phòng chơi realtime bằng mã với Socket.IO.
- Host tùy chỉnh đội hình, kick thành viên, chơi lại hoặc hủy phòng.
- Người chơi có thể rời phòng khi đang ở sảnh.
- Phân vai và hành động ban đêm bí mật.
- Bỏ phiếu công khai, phiếu trắng, phản biện và rút phiếu.
- Đồng hồ bỏ phiếu 3 phút và phản biện 30 giây.
- Tự động kiểm tra điều kiện chiến thắng.
- Sổ vai dạng toggle để tra cứu chức năng.
- Hiệu ứng chuyển ngày đêm, tử vong và âm thanh kinh dị.
- Nhạc nền, âm thanh hiệu ứng có nút bật/tắt riêng.
- Hỗ trợ reconnect khi refresh hoặc mất mạng tạm thời.
- Giao diện responsive cho máy tính và điện thoại.

## Các vai

| Phe | Vai | Chức năng |
| --- | --- | --- |
| Quỷ | **Quỷ Liếm** | Mỗi đêm chọn một người để loại khỏi khu phố. |
| Quỷ | **Quỷ Liếm Nhí** | Chỉ săn mồi khi tất cả Quỷ Liếm trưởng thành đã chết. |
| Khu phố | **Cô Bé Hay Đoán** | Mỗi đêm kiểm tra một người có thuộc phe Quỷ hay không. |
| Khu phố | **Cậu Bé Chơi Bùa** | Có một bùa cứu và một bùa hại, mỗi bùa dùng một lần. |
| Khu phố | **Gã Béo Nóng Tính** | Mỗi đêm bảo vệ một người khỏi Quỷ Liếm. |
| Khu phố | **Lọ Vương** | Khi chết, được chọn một người chết chung. |
| Khu phố | **Người Yêu Cũ** | Đêm đầu ghép đôi hai người; một người chết, người kia chết theo. |
| Khu phố | **Anh Hàng Xóm** | Không có kỹ năng, tham gia thảo luận và bỏ phiếu. |

## Luật chơi

1. Host tạo phòng và gửi mã phòng cho mọi người.
2. Khi đủ người, host chọn số lượng vai và bắt đầu.
3. Ban đêm, các vai có kỹ năng lần lượt thực hiện hành động bí mật.
4. Ban ngày, khu phố thảo luận và bỏ phiếu.
5. Khi tất cả người sống đã chọn, vote kết thúc ngay; nếu chưa đủ, vote kết thúc sau 3 phút.
6. Người dẫn đầu duy nhất có 30 giây phản biện. Những người buộc tội có thể rút phiếu.
7. Phe khu phố thắng khi không còn Quỷ Liếm. Phe Quỷ thắng khi số Quỷ còn sống lớn hơn hoặc bằng số dân còn sống.

## Bắt đầu

Yêu cầu:

- Node.js `20` trở lên
- npm

```bash
git clone https://github.com/thanhtrongg/quy-liem-online.git
cd quy-liem-online
npm install
npm start
```

Mở:

```text
http://localhost:3030
```

Chạy kiểm tra multiplayer tự động:

```bash
npm test
```

## Cấu trúc

```text
quy-liem-online/
├── public/
│   ├── fonts/          # Font Việt hóa
│   ├── images/         # Background và hình ảnh
│   ├── sounds/         # Nhạc nền và hiệu ứng
│   ├── app.js          # Client realtime
│   ├── index.html
│   └── styles.css
├── tests/
│   └── smoke.js        # Smoke test nhiều người chơi
├── server.js           # Express, Socket.IO và luật game
├── render.yaml         # Cấu hình Render Blueprint
└── package.json
```

## Deploy

### Render Blueprint

1. Fork hoặc sử dụng repository này.
2. Mở [Render Dashboard](https://dashboard.render.com/).
3. Chọn **Blueprints** → **New Blueprint Instance**.
4. Chọn repository `quy-liem-online`.
5. Nhấn **Deploy Blueprint**.

Render sẽ tự đọc [`render.yaml`](./render.yaml), cài dependencies và chạy `npm start`.

> [!IMPORTANT]
> Trạng thái phòng hiện được lưu trong RAM. Chỉ nên chạy **một instance**; phòng đang chơi sẽ mất khi server restart hoặc deploy phiên bản mới.

## Scripts

| Lệnh | Công dụng |
| --- | --- |
| `npm start` | Chạy server production |
| `npm run dev` | Chạy server với Node watch mode |
| `npm run check` | Kiểm tra cú pháp server và client |
| `npm test` | Chạy smoke test multiplayer |

## Công nghệ

- **Node.js + Express** phục vụ web và API health check.
- **Socket.IO** đồng bộ phòng và trạng thái game realtime.
- **HTML, CSS, JavaScript thuần** cho giao diện nhẹ và dễ deploy.
- **Web Audio + local audio assets** cho hiệu ứng âm thanh.
- **Render Blueprint** cho deploy nhanh.

---

<div align="center">

**Khu phố đang yên bình. Hơi yên bình quá mức.**

</div>
