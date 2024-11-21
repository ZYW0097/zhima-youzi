const pathParts = window.location.pathname.split('/');
const token = pathParts[1];
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

async function getReservationData() {
    try {
        const response = await fetch(`/api/reservation-data/${token}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        const date = new Date(data.date);
        const formattedDate = `${date.getFullYear()}年 ${date.getMonth() + 1}月 ${date.getDate()}日`;

        document.getElementById('bookingDateTime').textContent = `訂位日期：${formattedDate} ${data.time}`;
        document.getElementById('customerEmail').textContent = data.email;

        const lineBtn = document.getElementById('lineBtn');
        if (lineBtn) {
            lineBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (isMobile) {
                    window.location.href = `/line/mobile-redirect?token=${token}`;
                } else {
                    window.location.href = `/line?token=${token}`;
                }
            });
        }
    } catch (error) {
        console.error('Error fetching reservation data:', error);
        document.getElementById('error-message').textContent = '無法載入訂位資料，請稍後再試';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', getReservationData);
} else {
    getReservationData();
}
