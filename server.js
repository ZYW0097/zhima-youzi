const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const { createClient } = require('redis');
const RedisStore = require('connect-redis').default;
const cookieParser = require('cookie-parser');
const connectToDatabase = require('./database');
const redisUrl = process.env.REDIS_URL;
const fs = require('fs');
const axios = require('axios');
const channelAccessToken = process.env.LINEAPI;

const app = express();
const redisClient = createClient({
    url: redisUrl
  });
const PORT = process.env.PORT || 3000;

require('dotenv').config();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/images', express.static('images'));
app.use('/css', express.static('css'));
app.use('/js', express.static('js'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'html')));
app.use(cookieParser());
app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
}));

connectToDatabase();
redisClient.connect().catch(console.error);


const reservationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    gender: { type: String, required: true },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    adults: { type: Number, required: true },
    children: { type: Number, required: true },
    vegetarian: { type: String, default: '否' },
    specialNeeds: { type: String, default: '無' },
    notes: { 
        type: String, 
        required: false,  
        default: '無',    // 添加預設值
        maxlength: 30
    },
});
reservationSchema.index({ phone: 1, date: 1, time: 1 }, { unique: true });

const { invalidPhoneNumbers } = JSON.parse(fs.readFileSync('pnb.json', 'utf-8'));
const invalidNumbersPattern = invalidPhoneNumbers.join('|');
const phoneRegex = new RegExp(`^09(?!${invalidNumbersPattern})\\d{8}$`);
const LINE_CLIENT_ID = process.env.LINE_CLIENT_ID;  // LINE 客戶端 ID
const LINE_CLIENT_SECRET = process.env.LINE_CLIENT_SECRET;  // LINE 客戶端密鑰
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const REDIRECT_URI = 'https://zhima-youzi.onrender.com/media/line_callback';  // 您的回調 URL


const Reservation = mongoose.model('Reservation', reservationSchema, 'bookings');

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'html', 'index.html')));
app.get('/form', (req, res) => res.sendFile(path.join(__dirname, 'html', 'form.html')));
app.get('/questions', (req, res) => res.sendFile(path.join(__dirname, 'html', 'questions.html')));
app.get('/menu', (req, res) => res.sendFile(path.join(__dirname, 'html', 'menu.html')));

function generateToken(length = 8) {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

app.post('/reservations', async (req, res) => {
    console.log('Received reservation request:', req.body);  // 添加請求日誌
    console.log('Session LINE info:', {     // 添加 LINE 資訊日誌
        userId: req.session.lineUserId,
        name: req.session.lineName
    });

    const { name, phone, email, gender, date, time, adults, children, vegetarian, specialNeeds, notes } = req.body;
    const token = generateToken(8);
    const expiration = 120;

    try {
        // 保存訂位資料
        const reservation = new Reservation({ 
            name, phone, email, gender, date, time, 
            adults, children, vegetarian, specialNeeds, notes 
        });
        
        console.log('Attempting to save reservation:', reservation);  // 添加保存日誌
        await reservation.save();
        console.log('Reservation saved successfully');  // 添加成功日誌

        // 如果有 LINE 用戶 ID，發送通知
        if (req.session.lineUserId) {
            console.log('Preparing to send LINE notification');  // 添加 LINE 通知日誌
            const message = `
${req.session.lineName}，您好！
訂位成功通知！

訂位資訊：
姓名：${name}
日期：${new Date(date).toLocaleDateString()}
時間：${time}
人數：${adults}大${children}小
素食：${vegetarian}
特殊需求：${specialNeeds}
備註：${notes || '無'}

感謝您的訂位！
            `.trim();

            try {
                await sendLineMessage(req.session.lineUserId, message);
                console.log('LINE notification sent successfully');
            } catch (error) {
                console.error('LINE notification error:', error);
                // 繼續處理，不中斷訂位流程
            }
        }

        await redisClient.set(token, JSON.stringify({
            name, phone, gender, date, time,
        }), 'EX', expiration);

        res.cookie('token', token, { httpOnly: true });
        res.json({ success: true, redirectUrl: `/${token}/success` });

    } catch (error) {
        console.error('Reservation error details:', {  // 添加詳細錯誤日誌
            error: error.message,
            stack: error.stack,
            name: error.name
        });
        
        // 返回更具體的錯誤訊息
        res.status(500).json({ 
            success: false, 
            message: '訂位失敗，請稍後再試。', 
            error: error.message,
            details: error.name === 'ValidationError' ? '資料驗證失敗' : '系統錯誤'
        });
    }
});

// LINE 訊息發送函數的錯誤處理改進
async function sendLineMessage(userId, message) {
    if (!CHANNEL_ACCESS_TOKEN) {
        console.error('CHANNEL_ACCESS_TOKEN is missing');  // 添加配置錯誤日誌
        throw new Error('LINE messaging configuration is incomplete');
    }

    try {
        console.log('Sending LINE message to:', userId);  // 添加發送日誌
        const response = await axios.post('https://api.line.me/v2/bot/message/push', {
            to: userId,
            messages: [{
                type: "text",
                text: message
            }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
            }
        });
        console.log('LINE API response:', response.data);  // 添加響應日誌
        return response.data;
    } catch (error) {
        console.error('LINE message error details:', {  // 添加詳細錯誤日誌
            error: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        throw error;
    }
}

app.get('/:token/success', async (req, res) => {
    const token = req.params.token;
    const user = await redisClient.get(token);

    if (!user) {
        return res.redirect(`/form?error=invalid_token`);
    }

    setTimeout(async () => {
        await redisClient.del(token);
        console.log(`Token Deleted: ${token}, Time: ${new Date().toISOString()}`);
    }, 120000);

    res.sendFile(path.join(__dirname, 'html', 'success.html'));
});

app.get('/media', async (req, res) => {
    const state = generateState();  // 隨機生成 state
    req.session.state = state;  // 把 state 存入 session 中
    res.sendFile(path.join(__dirname, 'html', 'media.html'));
});

app.get('/get-line-state', (req, res) => {
    const state = generateState();
    req.session.state = state;
    res.json({ state });
});

// 路由：處理 LINE 回調，交換授權碼換取 Access Token
app.get('/media/line_callback', async (req, res) => {
    console.log('Received callback with query:', req.query);
    const { code, state, error, error_description } = req.query;

    // 檢查是否有來自 LINE 的錯誤
    if (error) {
        console.error('LINE authorization error:', error, error_description);
        return res.status(400).json({ 
            error: 'LINE 授權失敗', 
            details: error_description 
        });
    }

    if (!code) {
        console.error('No authorization code received');
        return res.status(400).json({ error: '授權碼未找到' });
    }

    try {
        // 創建用於交換訪問令牌的參數
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            client_id: LINE_CLIENT_ID,
            client_secret: LINE_CLIENT_SECRET
        });

        // 獲取訪問令牌
        const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token', 
            params.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const tokenData = tokenResponse.data;
        console.log('LINE Access Token:', tokenData);

        // 解析 id_token 來獲取用戶資訊
        const idToken = tokenData.id_token;
        const [, payload] = idToken.split('.');
        const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());
        
        // 儲存用戶 ID 到 session
        req.session.lineUserId = decodedPayload.sub;  // sub 是用戶的 LINE ID
        req.session.lineName = decodedPayload.name;   // 也可以儲存用戶名稱
        
        console.log('Stored LINE user info:', {
            userId: req.session.lineUserId,
            name: req.session.lineName
        });

        // 重定向到訂位表單
        res.redirect('/form');
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: '處理失敗',
            details: error.response?.data || error.message
        });
    }
});

app.post('/protected-views', (req, res) => {
    const { password } = req.body;
    if (password === '83094123') {
        req.session.passwordCorrect = true;
        res.redirect('/view');
    } else {
        res.status(401).send('密碼錯誤');
    }
});

app.get('/view', async (req, res) => {
    if (!req.session.passwordCorrect) {
        return res.status(403).send('未經授權，請先輸入密碼');
    }

    try {
        const reservations = await Reservation.find();
        res.render('reservations', { reservations });
    } catch (err) {
        console.error('Error fetching reservations:', err);
        res.status(500).json({ message: '無法載入訂位資料' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Connected to database: ${mongoose.connection.name}`);
});
