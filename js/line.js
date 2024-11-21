(async function() {
    try {
        const response = await fetch('https://zhima-youzi.onrender.com/get-line-state');
        const { state } = await response.json();
        
        const redirectUri = 'https://zhima-youzi.onrender.com/line/line_callback';
        
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: '2006585055',
            redirect_uri: redirectUri,
            state: state,
            scope: 'profile openid email',
            bot_prompt: 'aggressive'
        });
        
        // 這裡先導向到 LINE 授權頁面
        window.location.href = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
        
    } catch (error) {
        console.error('Error during LINE login:', error);
        const errorElement = document.getElementById('error-message');
        errorElement.style.display = 'block';
        errorElement.innerHTML = `
            <p>連接發生錯誤</p>
            <p class="error-details">${error.message}</p>
            <button onclick="window.location.reload()" class="retry-button">重試</button>
        `;
        document.querySelector('.loading-spinner').style.display = 'none';
        document.querySelector('.loading-text').style.display = 'none';
    }
})();
