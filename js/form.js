document.addEventListener('DOMContentLoaded', function() {
    if (typeof jQuery === 'undefined') {
        console.error('jQuery is not loaded!');
        return;
    }
    console.log('jQuery is loaded');
});

document.addEventListener('DOMContentLoaded', function () {
    const adultsSelect = document.getElementById('adults');
    const childrenSelect = document.getElementById('children');

    for (let i = 1; i <= 8; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        adultsSelect.appendChild(option);
    }

    for (let i = 0; i <= 8; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        childrenSelect.appendChild(option);
    }

    adultsSelect.value = 1;
    document.getElementById('preview-adults').textContent = 1;

    adultsSelect.addEventListener('change', () => {
        document.getElementById('preview-adults').textContent = adultsSelect.value;
    });
    childrenSelect.addEventListener('change', () => {
        document.getElementById('preview-children').textContent = childrenSelect.value;
    });
    document.getElementById('date').addEventListener('change', () => {
        document.getElementById('preview-date').textContent = document.getElementById('date').value;
    });
    document.getElementById('phone').addEventListener('input', () => {
        document.getElementById('preview-phone').textContent = document.getElementById('phone').value;
    });
    document.getElementById('email').addEventListener('input', () => {
        document.getElementById('preview-email').textContent = document.getElementById('email').value;
    });
    document.getElementById('notes').addEventListener('input', () => {
        document.getElementById('preview-notes').textContent = document.getElementById('notes').value;
    });

    document.getElementById('vegetarian').addEventListener('input', () => {
        document.getElementById('preview-vegetarian').textContent = document.getElementById('vegetarian').value;
    });

    document.getElementById('specialNeeds').addEventListener('input', () => {
        document.getElementById('preview-special').textContent = document.getElementById('specialNeeds').value;
    });
});


const today = new Date();
today.setHours(0, 0, 0, 0)
let selectedTime = null;
let selectedDate = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

function generateCalendar(month = currentMonth, year = currentYear) {
    const calendarTitle = document.getElementById('calendar-title');
    const daysContainer = document.getElementById('days-container');
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const firstDayWeekday = firstDay.getDay();

    calendarTitle.textContent = `${year}年 ${month + 1}月`;

    daysContainer.innerHTML = '';

    for (let i = 0; i < firstDayWeekday; i++) {
        daysContainer.appendChild(document.createElement('div'));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.textContent = day;
        dayElement.classList.add('day');

        const currentDate = new Date(year, month, day);

        if (currentDate < today) {
            dayElement.classList.add('disabled');
            dayElement.style.pointerEvents = 'none';
        } else {
            dayElement.addEventListener('click', () => selectDate(day, month, year));
        }

        daysContainer.appendChild(dayElement);
    }

    const prevMonthButton = document.getElementById('prevMonth');
    if (month === today.getMonth() && year === today.getFullYear()) {
        prevMonthButton.disabled = true;
        prevMonthButton.style.pointerEvents = 'none';
        prevMonthButton.style.opacity = 0.5;
    } else {
        prevMonthButton.disabled = false;
        prevMonthButton.style.pointerEvents = 'auto';
        prevMonthButton.style.opacity = 1;
    }
}

function selectDate(day, month, year) {
    selectedDate = new Date(year, month, day);
    const localDate = selectedDate.toLocaleDateString('en-CA');
    document.getElementById('date').value = localDate;
    document.getElementById('preview-date').textContent = `${selectedDate.toLocaleDateString()}`;

    const days = document.querySelectorAll('#days-container .day');
    days.forEach(dayElement => {
        dayElement.classList.remove('selected');
        if (parseInt(dayElement.textContent) === day) {
            dayElement.classList.add('selected');
        }
    });

    // 顯示時間選擇器，確保表單欄位保持隱藏
    document.getElementById('time-picker-container').style.display = 'block';
    
    updateTimeButtons();
}

document.getElementById('nextMonth').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    generateCalendar(currentMonth, currentYear);
});

document.getElementById('prevMonth').addEventListener('click', () => {
    if (currentMonth === 0) {
        currentMonth = 11;
        currentYear--;
    } else {
        currentMonth--;
    }
    generateCalendar(currentMonth, currentYear);
});

document.getElementById('currentMonth').addEventListener('click', () => {
    currentMonth = new Date().getMonth();
    currentYear = new Date().getFullYear();
    generateCalendar(currentMonth, currentYear);
});

window.onload = () => {
    generateCalendar(currentMonth, currentYear);
};

const dd = String(today.getDate()).padStart(2, '0');
const mm = String(today.getMonth() + 1).padStart(2, '0'); 
const yyyy = today.getFullYear();
const currentDate = `${yyyy}-${mm}-${dd}`;
document.getElementById('date').setAttribute('min', currentDate);

async function updateTimeButtons() {
    const selectedDate = new Date($('#date').val());
    const dayOfWeek = selectedDate.getDay();
    const dateString = selectedDate.toISOString().split('T')[0];
    
    console.log('Selected date:', dateString);
    console.log('Day of week:', dayOfWeek);
    
    // 清空現有的時間按鈕
    $('#time-picker-container').empty();
    
    try {
        // 獲取該日期的預訂狀態和限制
        const response = await fetch(`/api/time-slots?date=${dateString}`);
        const data = await response.json();
        
        // 顯示時段容器
        $('#time-picker-container').show();
        
        const timeContainer = document.createElement('div');
        timeContainer.className = 'time-slots';
        console.log('API response:', data);
        
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            // 平日時段
            createTimeSection('上午', [
                { id: 'wm1', times: ['11:00', '11:30'], count: data.wm1, limit: data.settings.wm },
                { id: 'wm2', times: ['12:00', '12:30'], count: data.wm2, limit: data.settings.wm },
                { id: 'wm3', times: ['13:00', '13:30'], count: data.wm3, limit: data.settings.wm }
            ], timeContainer);
            
            createTimeSection('下午', [
                { id: 'wa1', times: ['17:00', '17:30'], count: data.wa1, limit: data.settings.wa },
                { id: 'wa2', times: ['18:00', '18:30'], count: data.wa2, limit: data.settings.wa },
                { id: 'wa3', times: ['19:00', '19:30', '20:00'], count: data.wa3, limit: data.settings.wa }
            ], timeContainer);
        } else {
            // 假日時段
            createTimeSection('上午', [
                { id: 'hm1', times: ['11:00', '11:30'], count: data.hm1, limit: data.settings.hm },
                { id: 'hm2', times: ['12:00', '12:30'], count: data.hm2, limit: data.settings.hm },
                { id: 'hm3', times: ['13:00', '13:30'], count: data.hm3, limit: data.settings.hm },
                { id: 'hm4', times: ['14:00', '14:30'], count: data.hm4, limit: data.settings.hm }
            ], timeContainer);
            
            createTimeSection('下午', [
                { id: 'ha1', times: ['17:00', '17:30'], count: data.ha1, limit: data.settings.ha },
                { id: 'ha2', times: ['18:00', '18:30'], count: data.ha2, limit: data.settings.ha },
                { id: 'ha3', times: ['19:00', '19:30', '20:00'], count: data.ha3, limit: data.settings.ha }
            ], timeContainer);
        }
        
        $('#time-picker-container').append(timeContainer);
    } catch (error) {
        console.error('Error fetching time slots:', error);
    }
}

function createTimeSection(title, slots, container) {
    const section = document.createElement('div');
    section.className = 'time-section';
    
    const titleElement = document.createElement('h3');
    titleElement.textContent = title;
    section.appendChild(titleElement);
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'time-buttons';
    
    slots.forEach(slot => {
        // 創建一個時段的容器
        const slotContainer = document.createElement('div');
        slotContainer.className = 'time-slot-group';
        
        // 為每個時間創建獨立的按鈕，但保持它們的分組關係
        slot.times.forEach(time => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'time-button';
            button.dataset.slotId = slot.id;
            button.dataset.time = time;
            button.textContent = time;
            
            if (slot.count >= slot.limit) {
                button.disabled = true;
                button.classList.add('disabled');
            }
            
            button.addEventListener('click', function() {
                document.querySelectorAll('.time-button').forEach(btn => 
                    btn.classList.remove('selected')
                );
                this.classList.add('selected');
                
                const selectedTime = this.dataset.time;
                document.getElementById('time').value = selectedTime;
                document.getElementById('preview-time').textContent = selectedTime;
                
                // 測試代碼：檢查 jQuery 選擇器
                console.log('找到的 form-row 元素數量:', $('.form-row').length);
                console.log('form-row 元素:', $('.form-row'));
                
                // 顯示所有表單欄位
                $('.form-row').addClass('show');
                
                // 再次檢查是否成功添加 show class
                console.log('有 show class 的元素數量:', $('.form-row.show').length);
            });
            
            slotContainer.appendChild(button);
        });
        
        buttonsContainer.appendChild(slotContainer);
    });
    
    section.appendChild(buttonsContainer);
    container.appendChild(section);
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reservationForm');
  
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
  
        const formData = {
            name: form.name.value,
            phone: form.phone.value,
            email: form.email.value,
            gender: form.gender.value,
            date: form.date.value,
            time: form.time.value,
            adults: form.adults.value,
            children: form.children.value,
            vegetarian: form.vegetarian.value,
            specialNeeds: form.specialNeeds.value,
            notes: form.notes.value,
        };
  
        // 添加表單數據檢查
        console.log('Submitting form data:', formData);
  
        try {
            const response = await fetch('/reservations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
  
            if (response.ok) {
                console.log('Reservation successful, waiting for redirect...');
                
                // 清除表單內容
                form.reset();
                
                // 重置預覽區域
                document.getElementById('preview-adults').textContent = '1';
                document.getElementById('preview-children').textContent = '0';
                document.getElementById('preview-date').textContent = '尚未選擇';
                document.getElementById('preview-time').textContent = '尚未選擇';
                document.getElementById('preview-vegetarian').textContent = '否';
                document.getElementById('preview-special').textContent = '無';
                document.getElementById('preview-phone').textContent = '尚未填寫';
                document.getElementById('preview-email').textContent = '尚未填寫';
                document.getElementById('preview-notes').textContent = '無';
                
                // 重置日曆和時間選擇
                const days = document.querySelectorAll('#days-container .day');
                days.forEach(day => day.classList.remove('selected'));
                
                document.querySelectorAll('.time-button').forEach(btn => 
                    btn.classList.remove('selected')
                );
                
                // 隱藏時間選擇器和表單欄位
                document.getElementById('time-picker-container').style.display = 'none';
                document.querySelectorAll('.form-row').forEach(row => {
                    row.classList.remove('show');
                });
                
                // 重置下拉選單
                document.getElementById('adults').value = '1';
                document.getElementById('children').value = '0';
                document.getElementById('vegetarian').value = '否';
                document.getElementById('specialNeeds').value = '無';
                
            } else {
                alert(error.message);
            }
        } catch (error) {
            console.error('Reservation error details:', error);
            alert(error.message);
        }
    });
});
