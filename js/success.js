document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 從 URL 獲取 token
        const token = window.location.pathname.split('/')[1];
        
        // 獲取訂位資訊
        const response = await fetch(`/api/reservation-data/${token}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '無法獲取訂位資訊');
        }

        // 格式化日期
        const date = new Date(data.date);
        const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
        const formattedDate = `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;

        // 更新訂位時間顯示
        document.getElementById('bookingDateTime').textContent = 
            `${formattedDate} (${dayOfWeek}) ${data.time}`;

        // 更新 email 顯示
        document.getElementById('customerEmail').textContent = data.email;

        // 檢查是否為行動裝置
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        // 設定 LINE 按鈕連結
        const lineBtn = document.getElementById('lineBtn');
        if (isMobile) {
            lineBtn.href = `https://lin.ee/qzdxu8d`;
        } else {
            lineBtn.href = '/line/login';
        }

    } catch (error) {
        console.error('Error:', error);
        alert('發生錯誤，請重新整理頁面或聯繫客服');
    }
});
