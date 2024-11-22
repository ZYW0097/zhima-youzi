document.addEventListener('DOMContentLoaded', async () => {
    try {
        const pathParts = window.location.pathname.split('/');
        const token = pathParts[1]; 

        const response = await fetch(`/api/reservation/${token}`);
        if (!response.ok) {
            throw new Error('無法獲取預訂資訊');
        }
        const reservationData = await response.json();

        const bookingDateTime = document.getElementById('bookingDateTime');
        if (reservationData.date && reservationData.time) {
            const formattedDate = reservationData.date.replace(/-/g, '/');
            bookingDateTime.textContent = `訂位時間：${formattedDate} ${reservationData.time}`;
        }

        const customerEmail = document.getElementById('customerEmail');
        if (reservationData.email) {
            customerEmail.textContent = reservationData.email;
        }

        const lineBtn = document.getElementById('lineBtn');
        if (lineBtn) {
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (isMobile) {
                lineBtn.href = 'https://lin.ee/DqIRAm0';
            } else {
                lineBtn.href = '/line';
            }

            lineBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = lineBtn.href;
            });
        }

    } catch (error) {
        console.error('Error:', error);
        alert('發生錯誤，請重新整理頁面或聯繫客服');
    }
});
