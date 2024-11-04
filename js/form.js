document.addEventListener('DOMContentLoaded', function () {
    const adultsSelect = document.getElementById('adults');
    const childrenSelect = document.getElementById('children');
    const highChairSelect = document.getElementById('highChair');
    const highChairField = document.getElementById('highChairField');
    const highChairLabel = document.getElementById('highChairLabel');

    for (let i = 0; i <= 20; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        adultsSelect.appendChild(option);
    }

    for (let i = 0; i <= 20; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        childrenSelect.appendChild(option);
    }

    for (let i = 0; i <= 10; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        highChairSelect.appendChild(option);
    }

    childrenSelect.addEventListener('change', function () {
        const highChairField = document.getElementById('highChairField');
        const childrenCount = this.value;

        if (childrenCount > 0) {
            highChairField.style.display = 'block'; 
            highChairLabel.style.display = 'block';
        } else {
            highChairField.style.display = 'none'; 
            highChairLabel.style.display = 'none';
            highChairSelect.value = '';
        }
    });
});

document.getElementById('date').addEventListener('change', function () {
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    const selectedDate = new Date(this.value);

    if (selectedDate < today) {
        alert('日期不能選擇今天以前的日期');
        this.value = ''; // 清空選擇的日期
        document.getElementById('contactInfoDiv').style.display = 'none'; 
        $('#time-picker-container').hide();
    } else {
        document.getElementById('contactInfoDiv').style.display = 'block';
        $('#time-picker-container').show();
        updateTimeButtons();
    }
});

document.getElementById('reservationForm').addEventListener('submit', function (e) {
    e.preventDefault(); 

    const formData = $(this).serialize();

    $.post('/reservations', formData)
        .done(function(response) {
            document.getElementById('successMessage').style.display = 'block'; 
            document.getElementById('message').innerText = '';
            $('#reservationForm')[0].reset();
            document.getElementById('contactInfoDiv').style.display = 'none';
            $('#time-picker-container').hide();
            
            setTimeout(() => {
                location.reload();
            }, 1000);
        })
        .fail(function(jqXHR) {
            document.getElementById('message').innerText = jqXHR.responseJSON.message; 
            document.getElementById('successMessage').style.display = 'none'; 
        });
});

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
        createTimeButtons("11:00", "13:30", 35, "平日上午");
        createTimeButtons("17:00", "20:30", 35, "平日下午");
    } else {
        createTimeButtons("11:00", "14:30", 30, "假日上午");
        createTimeButtons("17:00", "20:30", 30, "假日下午");
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
        console.log("選擇的時間:", selectedTime); 
    });
}

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
