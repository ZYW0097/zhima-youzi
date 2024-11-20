// 從後端 API 獲取訂位資料
async function getReservationData() {
    try {
        const response = await fetch('/api/reservation-data');
        const data = await response.json();
        
        // 格式化日期
        const formattedDate = new Date(data.date).toLocaleDateString('zh-TW', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // 更新 HTML 內容
        document.getElementById('bookingDateTime').textContent = `訂位日期：${formattedDate} ${data.time}`;
        document.getElementById('customerEmail').textContent = data.email;
    } catch (error) {
        console.error('Error fetching reservation data:', error);
    }
}

// 頁面載入時獲取數據
document.addEventListener('DOMContentLoaded', getReservationData);