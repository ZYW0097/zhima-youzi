function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('toggleIcon');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.className = 'fas fa-eye-slash';
    } else {
        passwordInput.type = 'password';
        toggleIcon.className = 'fas fa-eye';
    }
}

function checkLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');

    if (!username || !password) {
        errorMessage.textContent = '請填寫所有欄位';
        errorMessage.style.display = 'block';
        return;
    }

    fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.location.href = 'backstage.html';
        } else {
            errorMessage.style.display = 'block';
            document.getElementById('password').value = '';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        errorMessage.textContent = '系統錯誤，請稍後再試';
        errorMessage.style.display = 'block';
    });
}

document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        checkLogin();
    }
});

window.onload = function() {
    document.getElementById('username').focus();
};

function clearError() {
    const errorMessage = document.getElementById('error-message');
    errorMessage.style.display = 'none';
}

document.getElementById('username').addEventListener('focus', clearError);
document.getElementById('password').addEventListener('focus', clearError);