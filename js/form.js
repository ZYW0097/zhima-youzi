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

    for (let i = 1; i <= 6; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i}位大人`;
        adultsSelect.appendChild(option);
    }

    for (let i = 0; i <= 6; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i}位小孩`;
        childrenSelect.appendChild(option);
    }

    adultsSelect.value = 1;
    document.getElementById('preview-adults').textContent = '1位大人';
    document.getElementById('preview-children').textContent = '0位小孩';

    adultsSelect.addEventListener('change', () => {
        document.getElementById('preview-adults').textContent = adultsSelect.value;
    });
    childrenSelect.addEventListener('change', () => {
        document.getElementById('preview-children').textContent = childrenSelect.value;
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

        const isToday = currentDate.getDate() === today.getDate() &&
                       currentDate.getMonth() === today.getMonth() &&
                       currentDate.getFullYear() === today.getFullYear();

        // 如果是今天，添加底線
        if (isToday) {
            const underline = document.createElement('div');
            underline.classList.add('day-underline');
            dayElement.appendChild(underline);
        }

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

    const formattedDate = `${year}/${String(month + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    const weekday = weekdays[selectedDate.getDay()];
    document.getElementById('preview-date').textContent = `${formattedDate} (${weekday})`;

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
    
    // 預先清空並顯示載入中的提示
    const timeContainer = $('#time-picker-container');
    timeContainer.html('<div class="loading">載入時段中...</div>').show();
    
    try {
        // 預先定義時段模板
        const weekdaySlots = {
            morning: [
                { time: '11:00', id: 'wm1' },
                { time: '11:30', id: 'wm1' },
                { time: '12:00', id: 'wm2' },
                { time: '12:30', id: 'wm2' },
                { time: '13:00', id: 'wm3' },
                { time: '13:30', id: 'wm3' }
            ],
            afternoon: [
                { time: '17:00', id: 'wa1' },
                { time: '17:30', id: 'wa1' },
                { time: '18:00', id: 'wa2' },
                { time: '18:30', id: 'wa2' },
                { time: '19:00', id: 'wa3' },
                { time: '19:30', id: 'wa3' },
                { time: '20:00', id: 'wa3' }
            ]
        };

        const holidaySlots = {
            morning: [
                { time: '11:00', id: 'hm1' },
                { time: '11:30', id: 'hm1' },
                { time: '12:00', id: 'hm2' },
                { time: '12:30', id: 'hm2' },
                { time: '13:00', id: 'hm3' },
                { time: '13:30', id: 'hm3' },
                { time: '14:00', id: 'hm4' },
                { time: '14:30', id: 'hm4' }
            ],
            afternoon: [
                { time: '17:00', id: 'ha1' },
                { time: '17:30', id: 'ha1' },
                { time: '18:00', id: 'ha2' },
                { time: '18:30', id: 'ha2' },
                { time: '19:00', id: 'ha3' },
                { time: '19:30', id: 'ha3' },
                { time: '20:00', id: 'ha3' }
            ]
        };

        // 獲取預訂狀態
        const response = await fetch(`/api/time-slots?date=${dateString}`);
        const data = await response.json();

        // 準備 HTML 字符串
        let html = '';
        const slots = (dayOfWeek >= 1 && dayOfWeek <= 5) ? weekdaySlots : holidaySlots;
        const limits = data.settings;

        // 生成上午時段
        html += '<div class="time-section">';
        html += '<h3>上午</h3>';
        html += '<div class="time-buttons">';
        slots.morning.forEach(slot => {
            const count = data[slot.id] || 0;
            const limit = limits[slot.id.substring(0, 2)] || 0;
            const disabled = count >= limit ? 'disabled' : '';
            html += `<button type="button" class="time-button ${disabled}" 
                     data-slot-id="${slot.id}" data-time="${slot.time}" 
                     ${disabled ? 'disabled' : ''}>${slot.time}</button>`;
        });
        html += '</div></div>';

        // 生成下午時段
        html += '<div class="time-section">';
        html += '<h3>下午</h3>';
        html += '<div class="time-buttons">';
        slots.afternoon.forEach(slot => {
            const count = data[slot.id] || 0;
            const limit = limits[slot.id.substring(0, 2)] || 0;
            const disabled = count >= limit ? 'disabled' : '';
            html += `<button type="button" class="time-button ${disabled}" 
                     data-slot-id="${slot.id}" data-time="${slot.time}" 
                     ${disabled ? 'disabled' : ''}>${slot.time}</button>`;
        });
        html += '</div></div>';

        // 一次性更新 DOM
        timeContainer.html(html);

        // 綁定事件監聽器
        timeContainer.find('.time-button').not('.disabled').on('click', function() {
            timeContainer.find('.time-button').removeClass('selected');
            $(this).addClass('selected');
            
            const selectedTime = $(this).data('time');
            $('#time').val(selectedTime);
            $('#preview-time').text(selectedTime);
            
            $('.form-row, .pe-note').addClass('show');
        });

    } catch (error) {
        console.error('Error fetching time slots:', error);
        timeContainer.html('<div class="error">載入時段失敗，請重試</div>');
    }
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
                body: JSON.stringify(formData),
                redirect: 'follow' 
            });
  
            if (response.redirected) {
                console.log('Reservation successful, waiting for redirect...');
                
                window.location.href = response.url;

                setTimeout(() => {
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
                
                // 重置日曆到當前月份
                currentMonth = new Date().getMonth();
                currentYear = new Date().getFullYear();
                generateCalendar(currentMonth, currentYear);
                
                // 重置時間選擇
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
                }, 100);
                

                return;

            } else {
                throw new Error(data.message || '預訂失敗，請稍後再試');
            }
        } catch (error) {
            console.error('Reservation error details:', error);
            alert(error.message);
        }
    });
});
