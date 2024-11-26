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
        editButton.textContent = '取消編輯';
        editButton.classList.add('editing');
        inputs.forEach(input => input.disabled = false);
        buttons.forEach(button => button.disabled = false);
    } else {
        editButton.textContent = '編輯';
        editButton.classList.remove('editing');
        inputs.forEach(input => input.disabled = true);
        buttons.forEach(button => button.disabled = true);
        resetSettings(); // 取消編輯時重置設置
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
    document.getElementById('wm').value = originalSettings.wm;
    document.getElementById('wa').value = originalSettings.wa;
    document.getElementById('hm').value = originalSettings.hm;
    document.getElementById('ha').value = originalSettings.ha;
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

    const settings = {
        wm,
        wa,
        hm,
        ha,
        upt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
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
            toggleEdit(); // 儲存成功後關閉編輯模式
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

// 頁面載入時讀取設置
document.addEventListener('DOMContentLoaded', loadSettings);