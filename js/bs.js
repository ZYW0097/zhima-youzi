let originalSettings = {
    wm: 2,
    wa: 2,
    hm: 3,
    ha: 3,
    upt: '-'
};

let isEditing = false;

// 追蹤新訂位的物件
const newBookings = new Map(); 

// 全局變量
let selectedBooking = null;

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
    const dateSelector = document.getElementById('booking-date');

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

    dateSelector.addEventListener('change', function(e) {
        loadBookings(new Date(e.target.value));
    });

    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) loadVIPList(currentPage - 1);
    });

    document.getElementById('next-page').addEventListener('click', () => {
        loadVIPList(currentPage + 1);
    });

    // 設置自動刷新訂位列表（每30秒）
    setInterval(() => {
        const currentDate = document.getElementById('booking-date').value;
        if (currentDate) {
            loadBookings(new Date(currentDate));
        }
    }, 30000); 

    loadSettings();
    loadBookings();
    checkTokenValidity();
    loadVIPList(1);
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
async function loadBookings(selectedDate = null) {
    try {
        const targetDate = selectedDate || new Date();
        const dateString = targetDate.toLocaleDateString('en-CA');

        // 更新標題
        const titleElement = document.querySelector('.header-left h2');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // 格式化日期
        const weekDay = targetDate.toLocaleString('zh-TW', { weekday: 'long' });
        if (targetDate.getTime() === today.getTime()) {
            titleElement.textContent = `今日訂位 (${weekDay})`;
        } else {
            const formattedDate = targetDate.toLocaleString('zh-TW', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }).replace(/\//g, '年').replace(/ /g, '').replace(/,$/, '日');
            titleElement.textContent = `${formattedDate} (${weekDay})`;
        }

        // 更新日期選擇器的值
        const dateSelector = document.getElementById('booking-date');
        if (dateSelector) {
            dateSelector.value = dateString;
        }

        // 分開獲取訂位資料和常客資料
        const [bookingsResponse, vipResponse] = await Promise.all([
            fetch(`/api/bookings?date=${dateString}`),
            fetch('/api/vip/phones')
        ]);

        const [bookings, vipPhones] = await Promise.all([
            bookingsResponse.json(),
            vipResponse.json()
        ]);

        const currentTime = new Date();
        const bookingsList = document.getElementById('bookings-list');
        bookingsList.innerHTML = '';
        
        if (bookings && bookings.length > 0) {
            bookings.forEach(booking => {
                // 先檢查是否為新訂位（10分鐘內）
                const bookingTime = new Date(booking.createdAt);
                const timeDiff = currentTime - bookingTime;
                const isNewBooking = timeDiff <= 600000; // 10分鐘

                // 檢查是否仍在新訂位狀態
                const isStillNew = isNewBooking && !newBookings.has(booking._id);

                // 創建訂位項目
                const bookingItem = document.createElement('div');
                bookingItem.className = `booking-item${isStillNew ? ' new-booking' : ''}`;
                
                if (isStillNew) {
                    newBookings.set(booking._id, currentTime);
                    setTimeout(() => {
                        newBookings.delete(booking._id);
                        loadBookings(selectedDate); // 重新載入以更新顯示
                    }, 600000);
                }

                const totalPeople = booking.adults + booking.children;
                
                // 組合備註資訊
                let notes = [];
                if (booking.vegetarian !== '否') notes.push(`素食: ${booking.vegetarian}`);
                if (booking.specialNeeds !== '無') notes.push(booking.specialNeeds);
                if (booking.notes !== '無') notes.push(booking.notes);
                const noteText = notes.length > 0 ? notes.join(', ') : '-';
                
                const periodText = getPeriodText(booking.time);
                
                // 檢查是否為常客
                const isVIP = Array.isArray(vipPhones) && vipPhones.includes(booking.phone);
                const vipStar = isVIP ? '<span class="vip-star">⭐</span>' : '';
                
                bookingItem.innerHTML = `
                    ${isStillNew ? `<div class="new-booking-label">*新訂位</div>` : ''}
                    <div class="booking-cell" data-label="時段">${periodText} ${booking.time}</div>
                    <div class="booking-cell" data-label="姓名">${booking.name} ${vipStar}</div>
                    <div class="booking-cell" data-label="電話">${booking.phone}</div>
                    <div class="booking-cell" data-label="人數">${totalPeople}人</div>
                    <div class="booking-cell" data-label="備註">${noteText}</div>
                    <div class="booking-cell" data-label="狀態">
                        <span class="${booking.canceled ? 'status-cancelled' : (booking.seated ? 'status-seated' : 'status-not-seated')}">
                            ${booking.canceled ? '已取消' : (booking.seated ? '已入座' : '尚未入座')}
                        </span>
                    </div>
                    ${!booking.canceled ? `
                        <div class="booking-cell seat-button-container">
                            <button 
                                class="seat-button ${booking.seated ? 'hidden' : ''}"
                                onclick="markAsSeated('${booking._id}')"
                            >
                                已入座
                            </button>
                        </div>
                    ` : ''}
                `;
                
                bookingsList.appendChild(bookingItem);
            });
        } else {
            bookingsList.innerHTML = '<div class="no-bookings">此日無訂位</div>';
        }
    } catch (error) {
        console.error('載入訂位失敗:', error);
    }
}

// 常客管理相關函數
async function checkAndAddVIP() {
    const name = document.getElementById('vip-name').value.trim();
    const phone = document.getElementById('vip-phone').value.trim();
    
    if (!name || !phone) {
        showVIPMessage('請填寫完整資料', 'error');
        return;
    }

    try {
        const response = await fetch('/api/vip/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, phone })
        });

        const result = await response.json();
        
        if (response.ok) {
            showVIPMessage(result.message || '成功加入常客名單', 'success');
            // 清空輸入欄位
            document.getElementById('vip-name').value = '';
            document.getElementById('vip-phone').value = '';
            
            // 重新載入常客列表，回到第一頁
            currentPage = 1;
            await loadVIPList(1);
        } else {
            showVIPMessage(result.message || '新增失敗', 'error');
        }
    } catch (error) {
        console.error('新增常客失敗:', error);
        showVIPMessage('系統錯誤，請稍後再試', 'error');
    }
}

function showVIPMessage(message, type) {
    const messageDiv = document.getElementById('vip-message');
    messageDiv.textContent = message;
    messageDiv.className = `vip-message ${type}`;
    messageDiv.style.display = 'block';  // 確保訊息是可見的
    
    // 3秒後隱藏訊息
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 3000);
}

let currentPage = 1;
const itemsPerPage = 10;

async function loadVIPList(page = 1) {
    try {
        const response = await fetch(`/api/vip/list?page=${page}&limit=10`);
        const data = await response.json();
        
        const vipList = document.getElementById('vip-list');
        vipList.innerHTML = '';
        
        if (data.vips && data.vips.length > 0) {
            data.vips.forEach((vip, index) => {
                const vipItem = document.createElement('div');
                vipItem.className = 'vip-item';
                vipItem.innerHTML = `
                    <div class="vip-info">
                        <span>${((page - 1) * 10) + index + 1}.</span>
                        <span>${vip.name}</span>
                        <span>${vip.phone}</span>
                    </div>
                    <span>${new Date(vip.createdAt).toLocaleDateString('zh-TW')}</span>
                `;
                vipList.appendChild(vipItem);
            });

            // 更新分頁按鈕狀態
            document.getElementById('prev-page').disabled = page <= 1;
            document.getElementById('next-page').disabled = !data.hasNextPage;
            document.getElementById('page-info').textContent = `第 ${page} 頁`;
            currentPage = page;
        } else {
            vipList.innerHTML = '<div class="no-vip">目前沒有常客資料</div>';
        }
    } catch (error) {
        console.error('載入常客列表失敗:', error);
        document.getElementById('vip-list').innerHTML = '<div class="error">載入失敗，請稍後再試</div>';
    }
}

// 標記入座狀態
async function markAsSeated(bookingId) {
    try {
        const response = await fetch(`/api/bookings/${bookingId}/seat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            // 重新載入訂位資料
            loadBookings(new Date(document.getElementById('booking-date').value));
        } else {
            alert('更新入座狀態失敗');
        }
    } catch (error) {
        console.error('更新入座狀態時發生錯誤:', error);
        alert('系統錯誤，請稍後再試');
    }
}

// 切換搜尋方式
document.querySelectorAll('.search-type-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        // 更新按鈕狀態
        document.querySelectorAll('.search-type-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        // 切換表單顯示
        const type = this.dataset.type;
        document.getElementById('code-search').style.display = type === 'code' ? 'block' : 'none';
        document.getElementById('info-search').style.display = type === 'info' ? 'block' : 'none';
        
        // 清空搜尋結果和取消原因
        clearSearchResults();
        clearForm();
    });
});

// 使用訂位代碼搜尋
async function searchByCode() {
    const code = document.getElementById('booking-code').value.trim();
    if (!code) {
        alert('請輸入訂位代碼');
        return;
    }

    try {
        const response = await fetch('/api/reservations/search-by-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ bookingCode: code })
        });

        const data = await response.json();
        if (response.ok) {
            displaySearchResult([data]);
        } else {
            alert(data.error || '搜尋失敗');
        }
    } catch (error) {
        console.error('搜尋失敗:', error);
        alert('系統錯誤，請稍後再試');
    }
}

// 使用姓名和電話搜尋
async function searchByInfo() {
    const name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    
    if (!name || !phone) {
        alert('請輸入姓名和電話');
        return;
    }

    try {
        const response = await fetch('/api/reservations/search-by-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, phone })
        });

        const data = await response.json();
        if (response.ok) {
            displaySearchResult(data);
        } else {
            alert(data.error || '搜尋失敗');
        }
    } catch (error) {
        console.error('搜尋失敗:', error);
        alert('系統錯誤，請稍後再試');
    }
}

// 顯示搜尋結果
function displaySearchResult(bookings) {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';
    
    bookings.forEach(booking => {
        const bookingElement = document.createElement('div');
        bookingElement.className = 'booking-result';
        bookingElement.innerHTML = `
            <div class="booking-info">
                <p><strong>訂位日期：</strong>${booking.date}</p>
                <p><strong>訂位時間：</strong>${booking.time}</p>
                <p><strong>姓名：</strong>${booking.name}</p>
                <p><strong>電話：</strong>${booking.phone}</p>
                <p><strong>人數：</strong>${booking.adults}大${booking.children}小</p>
                <p><strong>訂位代碼：</strong>${booking.bookingCode}</p>
            </div>
            <div class="button-group">
                <button class="confirm-btn" onclick="selectBooking('${booking.bookingCode}')">
                    選擇取消此訂位
                </button>
            </div>
        `;
        resultsContainer.appendChild(bookingElement);
    });
}

// 選擇要取消的訂位
function selectBooking(bookingCode) {
    selectedBooking = bookingCode;
    document.getElementById('cancel-reason-container').style.display = 'block';
}

// 確認取消訂位
function confirmCancel() {
    const reason = document.getElementById('cancel-reason').value.trim();
    if (!reason) {
        alert('請輸入取消原因');
        return;
    }
    
    // 顯示員工姓名輸入框
    document.getElementById('staff-name-modal').style.display = 'block';
}

// 關閉員工姓名輸入框
function closeStaffModal() {
    document.getElementById('staff-name-modal').style.display = 'none';
}

// 處理取消訂位
async function processCancel() {
    const staffName = document.getElementById('staff-name').value.trim();
    if (!staffName) {
        alert('請輸入員工姓名');
        return;
    }

    const reason = document.getElementById('cancel-reason').value.trim();
    
    try {
        const response = await fetch('/api/reservations/manual-cancel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bookingCode: selectedBooking,
                reason: reason,
                staffName: staffName
            })
        });

        const data = await response.json();
        if (response.ok) {
            alert('訂位已成功取消');
            clearSearchResults();
            closeStaffModal();
        } else {
            alert(data.error || '取消失敗');
        }
    } catch (error) {
        console.error('取消失敗:', error);
        alert('系統錯誤，請稍後再試');
    }
}

// 放棄取消
function abandonCancel() {
    selectedBooking = null;
    document.getElementById('cancel-reason-container').style.display = 'none';
    document.getElementById('cancel-reason').value = '';
}

// 清空搜尋結果
function clearSearchResults() {
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('cancel-reason-container').style.display = 'none';
    document.getElementById('cancel-reason').value = '';
    selectedBooking = null;
}

function clearForm() {
    // 清除所有輸入框的值
    document.getElementById('booking-code').value = '';
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-phone').value = '';
}
