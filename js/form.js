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
    document.getElementById('date').value = selectedDate.toISOString().split('T')[0];
    document.getElementById('preview-date').textContent = `${selectedDate.toLocaleDateString()}`;

    const days = document.querySelectorAll('#days-container .day');
    days.forEach(dayElement => {
        dayElement.classList.remove('selected');
        if (parseInt(dayElement.textContent) === day) {
            dayElement.classList.add('selected');
        }
    });

    updateTimeButtons();
    document.getElementById('contactInfoDiv').style.display = 'block';
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

const today = new Date();
const dd = String(today.getDate()).padStart(2, '0');
const mm = String(today.getMonth() + 1).padStart(2, '0'); // 1月是0
const yyyy = today.getFullYear();
const currentDate = `${yyyy}-${mm}-${dd}`;
document.getElementById('date').setAttribute('min', currentDate);

function updateTimeButtons() {
    const selectedDate = new Date($('#date').val());
    const dayOfWeek = selectedDate.getDay(); 

    $('#time-picker-container').empty(); 

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {  
        createTimeButtons("11:00", "13:30", 30, "平日上午");
        createTimeButtons("17:00", "20:30", 30, "平日下午");
    } else {  
        createTimeButtons("11:00", "14:30", 60, "假日上午");
        createTimeButtons("17:00", "20:30", 60, "假日下午");
    }

    $('#time-picker-container').show(); 
}

function createTimeButtons(startTime, endTime, interval, timeLabel) {
    const start = new Date(`1970-01-01T${startTime}:00`); 
    const end = new Date(`1970-01-01T${endTime}:00`); 

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

document.getElementById('reservationForm').addEventListener('submit', function (e) {
    e.preventDefault(); 

    const submitButton = document.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const formData = new FormData(this);
    const formObject = {};
    formData.forEach((value, key) => {
        formObject[key] = value;
    });
    const jsonData = JSON.stringify(formObject);

    // 發送 POST 請求
    fetch('/reservations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: jsonData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('網路錯誤，請稍後再試');
        }
        return response.json(); 
    })
    .then(data => {
        if (data.success) {
            window.location.href = `/success?token=${data.token}`; 
        } else {
            document.getElementById('message').innerText = data.message || '提交失敗，請稍後再試。';
        }
    })
    .catch(error => {
        document.getElementById('message').innerText = '提交失敗，請稍後再試。';
        console.error('Error:', error);
    })
    .finally(() => {
        submitButton.disabled = false;
    });
});
