document.addEventListener('DOMContentLoaded', async () => {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const bookingDate = urlParams.get('date');
        const bookingTime = urlParams.get('time');
        const email = urlParams.get('email');

        const bookingDateTime = document.getElementById('bookingDateTime');
        if (bookingDate && bookingTime) {
            const formattedDate = bookingDate.replace(/-/g, '/');
            bookingDateTime.textContent = `訂位時間：${formattedDate} ${bookingTime}`;
        }

        const customerEmail = document.getElementById('customerEmail');
        if (email) {
            customerEmail.textContent = email;
        }

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        const lineBtn = document.getElementById('lineBtn');

        if (isMobile) {
            lineBtn.href = 'https://lin.ee/DqIRAm0';
        } else {
            lineBtn.href = '/line';
        }

    } catch (error) {
        console.error('Error:', error);
        alert('發生錯誤，請重新整理頁面或聯繫客服');
    }
});
