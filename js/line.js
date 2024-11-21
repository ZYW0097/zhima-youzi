(async function() {
    try {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        const urlParams = new URLSearchParams(window.location.search);
        const reservationToken = urlParams.get('token');
        
        if (isMobile) {
            const response = await fetch('/get-line-state');
            const { state } = await response.json();
            
            const redirectUrl = `/line/mobile-redirect?token=${reservationToken}`;
            window.location.href = redirectUrl;
        } else {
            const response = await fetch('/get-line-state');
            const { state } = await response.json();
            
            const redirectUri = 'https://zhima-youzi.onrender.com/line/line_callback';
            
            const params = new URLSearchParams({
                response_type: 'code',
                client_id: '2006585055',
                redirect_uri: redirectUri,
                state: state,
                scope: 'profile openid email',
                bot_prompt: 'normal'
            });
            
            window.location.href = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
        }
    } catch (error) {
        console.error('Error during LINE login:', error);
        const errorElement = document.getElementById('error-message');
        if (errorElement) {
            errorElement.style.display = 'block';
            errorElement.innerHTML = `
                <p>連接發生錯誤</p>
                <p class="error-details">${error.message}</p>
                <button onclick="window.location.reload()" class="retry-button">重試</button>
            `;
        }
        const spinner = document.querySelector('.loading-spinner');
        const loadingText = document.querySelector('.loading-text');
        if (spinner) spinner.style.display = 'none';
        if (loadingText) loadingText.style.display = 'none';
    }
})();
