let originalSettings = {
    wm: 2,
    wa: 2,
    hm: 3,
    ha: 3,
    upt: '-'
};

let isEditing = false;

// 切換編輯模式
function toggleEdit() {
    isEditing = !isEditing;
    const editButton = document.querySelector('.edit-button');
    const inputs = document.querySelectorAll('.settings-input');
    const buttons = document.querySelectorAll('.button');
    
    if (isEditing) {
        // 進入編輯模式
        editButton.textContent = '取消編輯';
        editButton.classList.add('editing');
        inputs.forEach(input => input.disabled = false);
        document.querySelector('.cancel-button').disabled = false;
        document.querySelector('.confirm-button').disabled = false;
    } else {
        // 退出編輯模式
        editButton.textContent = '編輯';
        editButton.classList.remove('editing');
        inputs.forEach(input => {
            input.disabled = true;
            // 重置為原始值
            input.value = originalSettings[input.id];
        });
        document.querySelector('.cancel-button').disabled = true;
        document.querySelector('.confirm-button').disabled = true;
    }
}

// 載入設置
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        if (settings) {
            originalSettings = settings;
            document.getElementById('wm').value = settings.wm;
            document.getElementById('wa').value = settings.wa;
            document.getElementById('hm').value = settings.hm;
            document.getElementById('ha').value = settings.ha;
            document.getElementById('lastUpdateTime').textContent = settings.upt || '-';
        }
    } catch (error) {
        console.error('載入設置失敗:', error);
    }
}

// 重置設置
function resetSettings() {
    const inputs = document.querySelectorAll('.settings-input');
    inputs.forEach(input => {
        input.value = originalSettings[input.id];
    });
}

// 儲存設置
async function saveSettings() {
    const wm = parseInt(document.getElementById('wm').value);
    const wa = parseInt(document.getElementById('wa').value);
    const hm = parseInt(document.getElementById('hm').value);
    const ha = parseInt(document.getElementById('ha').value);

    // 驗證數值
    if (isNaN(wm) || isNaN(wa) || isNaN(hm) || isNaN(ha)) {
        alert('請輸入有效的數字');
        return;
    }

    // 使用台灣時區並格式化時間
    const settings = {
        wm,
        wa,
        hm,
        ha,
        upt: new Date().toLocaleString('zh-TW', {
            timeZone: 'Asia/Taipei',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            weekday: 'long'
        }).replace(/\//g, '年').replace(/,/g, '日')
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            alert('設置已更新');
            originalSettings = settings;
            document.getElementById('lastUpdateTime').textContent = settings.upt;
            toggleEdit();
        } else {
            alert('更新失敗');
        }
    } catch (error) {
        console.error('儲存設置失敗:', error);
        alert('更新失敗');
    }
}

// 登出功能
function logout() {
    fetch('/api/logout', {
        method: 'POST',
        credentials: 'same-origin'
    })
    .then(() => {
        window.location.href = '/bsl';
    })
    .catch(error => {
        console.error('Logout error:', error);
    });
}

async function checkTokenValidity() {
    try {
        const response = await fetch('/api/check-auth', {
            method: 'GET',
            credentials: 'same-origin' 
        });

        if (!response.ok) {
            window.location.href = '/bsl';
            return false;
        }
        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/bsl';
        return false;
    }
}

setInterval(checkTokenValidity, 60000); 

document.addEventListener('DOMContentLoaded', function() {
    const menuItems = document.querySelectorAll('.menu-item');
    const content = document.querySelector('.content');
    const sidebar = document.querySelector('.sidebar');
    const backButton = document.querySelector('.back-button');
    const pageTitle = document.querySelector('.page-title');

    function showPage(pageId) {
        // 隱藏所有頁面
        document.querySelectorAll('.content-page').forEach(page => {
            page.style.display = 'none';
        });
        // 顯示選中的頁面
        const selectedPage = document.getElementById(pageId);
        if (selectedPage) {
            selectedPage.style.display = 'block';
        }
    }

    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            const pageId = this.dataset.page;
            
            // 更新選中狀態
            menuItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            
            // 更新頁面標題
            pageTitle.textContent = this.textContent;
            
            // 顯示選中的頁面
            showPage(pageId);

            // 在移動端切換顯示
            if (window.innerWidth <= 768) {
                sidebar.style.display = 'none';
                content.style.display = 'block';
                content.classList.add('show');
            }
        });
    });

    // 返回按鈕處理
    backButton.addEventListener('click', function() {
        content.classList.remove('show');
        sidebar.style.display = 'block';
        content.style.display = 'none';
    });

    // 處理視窗大小變化
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            sidebar.style.display = 'block';
            content.style.display = 'block';
            content.classList.remove('show');
        } else {
            if (content.classList.contains('show')) {
                sidebar.style.display = 'none';
            } else {
                sidebar.style.display = 'block';
                content.style.display = 'none';
            }
        }
    });

    loadSettings();
    loadTodayBookings();
    checkTokenValidity();
    showPage('reservations');
});

function getPeriodText(time) {
    const hour = parseInt(time.split(':')[0]);
    if (hour >= 11 && hour < 15) {
        return '上午';
    } else if (hour >= 17 && hour <= 20) {
        return '下午';
    } else {
        return '未知時段';
    }
}

// 載入今日訂位
async function loadTodayBookings() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const response = await fetch(`/api/bookings?date=${today}`);
        const bookings = await response.json();
        
        const bookingsList = document.getElementById('bookings-list');
        bookingsList.innerHTML = '';
        
        if (bookings && bookings.length > 0) {
            bookings.forEach(booking => {
                const bookingItem = document.createElement('div');
                bookingItem.className = 'booking-item';
                
                const totalPeople = booking.adults + booking.children;
                
                // 組合備註資訊
                let notes = [];
                if (booking.vegetarian !== '否') notes.push(`素食: ${booking.vegetarian}`);
                if (booking.specialNeeds !== '無') notes.push(booking.specialNeeds);
                if (booking.notes !== '無') notes.push(booking.notes);
                const noteText = notes.length > 0 ? notes.join(', ') : '-';
                
                const periodText = getPeriodText(booking.time);
                
                bookingItem.innerHTML = `
                    <div class="booking-cell">${periodText} ${booking.time}</div>
                    <div class="booking-cell">${booking.name}</div>
                    <div class="booking-cell">${booking.phone}</div>
                    <div class="booking-cell">${totalPeople}人</div>
                    <div class="booking-cell">${noteText}</div>
                    <div class="booking-cell status-active">已確認</div>
                `;
                
                bookingsList.appendChild(bookingItem);
            });
        } else {
            bookingsList.innerHTML = '<div class="no-bookings">今日無訂位</div>';
        }
    } catch (error) {
        console.error('載入訂位失敗:', error);
    }
}
