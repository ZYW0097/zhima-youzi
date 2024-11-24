const taipeiOptions = { timeZone: 'Asia/Taipei' };

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

let selectedTime = null;
let selectedDate = null;
const now = new Date();
let currentMonth = parseInt(now.toLocaleString('zh-TW', { ...taipeiOptions, month: 'numeric' })) - 1;
let currentYear = parseInt(now.toLocaleString('zh-TW', { ...taipeiOptions, year: 'numeric' }));

const today = new Date(now.toLocaleString('zh-TW', taipeiOptions));
today.setHours(0, 0, 0, 0);

function generateCalendar(month = currentMonth, year = currentYear) {
    const calendarTitle = document.getElementById('calendar-title');
    const daysContainer = document.getElementById('days-container');
    
    month = parseInt(month);
    year = parseInt(year);
    
    calendarTitle.textContent = `${year}年 ${month + 1}月`;
    daysContainer.innerHTML = '';
    
    const firstDay = new Date(new Date(year, month, 1).toLocaleString('zh-TW', taipeiOptions));
    const lastDay = new Date(new Date(year, month + 1, 0).toLocaleString('zh-TW', taipeiOptions));
    
    const daysInMonth = lastDay.getDate();
    const firstDayWeekday = firstDay.getDay();
    
    const calendarGrid = document.createElement('div');
    calendarGrid.className = 'calendar-grid';
    
    for (let i = 0; i < firstDayWeekday; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'day empty';
        calendarGrid.appendChild(emptyDay);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.textContent = day;
        dayElement.className = 'day';
        
        const currentDate = new Date(new Date(year, month, day).toLocaleString('zh-TW', taipeiOptions));
        currentDate.setHours(0, 0, 0, 0);
        
        if (currentDate < today) {
            dayElement.classList.add('disabled');
            dayElement.style.pointerEvents = 'none';
            dayElement.style.color = '#ccc';
        } else {
            dayElement.addEventListener('click', () => {
                const allDays = daysContainer.querySelectorAll('.day');
                allDays.forEach(d => d.classList.remove('selected'));
                dayElement.classList.add('selected');
                
                const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dateInput = document.getElementById('date');
                dateInput.value = formattedDate;
                dateInput.dispatchEvent(new Event('change'));
                
                selectDate(day, month, year);
            });
            dayElement.style.cursor = 'pointer';
        }
        
        calendarGrid.appendChild(dayElement);
    }
    
    daysContainer.innerHTML = '';
    daysContainer.appendChild(calendarGrid);
    
    const prevMonthBtn = document.getElementById('prevMonth');
    if (month === today.getMonth() && year === today.getFullYear()) {
        prevMonthBtn.disabled = true;
        prevMonthBtn.style.opacity = '0.5';
    } else {
        prevMonthBtn.disabled = false;
        prevMonthBtn.style.opacity = '1';
    }
}

function selectDate(day, month, year) {
    const date = new Date(year, month, day);
    const taipeiDate = new Date(date.toLocaleString('zh-TW', taipeiOptions));
    
    selectedDate = taipeiDate;
    
    const formattedDate = taipeiDate.toISOString().split('T')[0];
    
    document.getElementById('date').value = formattedDate;
    document.getElementById('preview-date').textContent = taipeiDate.toLocaleDateString('zh-TW');
    
    updateTimeButtons();
    
    document.getElementById('contactInfoDiv').style.display = 'block';
    
    console.log('Date set:', formattedDate);
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
    const now = new Date();
    currentMonth = now.getMonth();
    currentYear = now.getFullYear();
    generateCalendar(currentMonth, currentYear);
});

document.addEventListener('DOMContentLoaded', () => {
    generateCalendar();
    console.log('Calendar initialized:', currentYear, currentMonth + 1);
});

const dd = String(today.getDate()).padStart(2, '0');
const mm = String(today.getMonth() + 1).padStart(2, '0'); // 1月是0
const yyyy = today.getFullYear();
const currentDate = `${yyyy}-${mm}-${dd}`;
document.getElementById('date').setAttribute('min', currentDate);

function updateTimeButtons() {
    const selectedDateStr = $('#date').val();
    if (!selectedDateStr) return;
    
    const selectedDate = new Date(new Date(selectedDateStr + 'T00:00:00').toLocaleString('zh-TW', taipeiOptions));
    const dayOfWeek = selectedDate.getDay();
    
    $('#time-picker-container').empty();

    if (dayOfWeek === 0 || dayOfWeek === 6) {
        createTimeButtons("11:00", "14:30", 60, "假日上午");
        createTimeButtons("17:00", "20:30", 60, "假日下午");
        console.log('Weekend schedule:', selectedDateStr, 'Day:', dayOfWeek);
    } else {
        createTimeButtons("11:00", "13:30", 30, "平日上午");
        createTimeButtons("17:00", "20:30", 30, "平日下午");
        console.log('Weekday schedule:', selectedDateStr, 'Day:', dayOfWeek);
    }

    $('#time-picker-container').show(); 
}

function createTimeButtons(startTime, endTime, interval, timeLabel) {
    const start = new Date(new Date(`1970-01-01T${startTime}:00`).toLocaleString('zh-TW', taipeiOptions));
    const end = new Date(new Date(`1970-01-01T${endTime}:00`).toLocaleString('zh-TW', taipeiOptions));

    const timeContainer = $('<div class="time-container"></div>');
    timeContainer.append(`<h3>${timeLabel}</h3>`); 

    const buttonRow = $('<div class="time-buttons"></div>'); 

    for (let time = start; time <= end; time.setMinutes(time.getMinutes() + interval)) {
        const timeString = time.toTimeString().slice(0, 5);
        buttonRow.append(`<button type="button" class="time-button" data-time="${timeString}">${timeString}</button>`);
    }

    timeContainer.append(buttonRow);
    $('#time-picker-container').append(timeContainer);
    $('.time-button').on('click', function() {
        $('.time-button').removeClass('selected'); 
        $(this).addClass('selected'); 
        
        const selectedTime = $(this).data('time');
        $('#selectedTime').val(selectedTime); 
        document.getElementById('preview-time').textContent = selectedTime; 
        
        $('.form-row').addClass('show'); 
    });
}

$('#date').on('change', function() {
    updateTimeButtons(); 
    $('.form-row').removeClass('show');
});

document.getElementById('viewReservationsBtn').addEventListener('click', function() {
    document.getElementById('passwordModal').style.display = 'block';
});

document.getElementById('passwordForm').addEventListener('submit', function(e) {
    e.preventDefault(); 
    const password = this.password.value;

    fetch('/protected-views', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password })
    })
    .then(response => {
        if (response.redirected) {
            window.location.href = response.url; 
        } else {
            return response.text().then(text => alert(text)); 
        }
    });
});

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
            } else {
                alert('訂位失敗，請稍後再試。');
            }
        } catch (error) {
            console.error('Reservation error:', error);
            alert('提交失敗，請稍後再試。');
        }
    });
});
