async function getReservationData() {
    try {
        const response = await fetch('/api/reservation-data');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
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
        // 顯示錯誤訊息給用戶
        document.getElementById('error-message').textContent = '無法載入訂位資料，請稍後再試';
    }
}

// 只在文檔完全載入後執行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', getReservationData);
} else {
    getReservationData();
}
