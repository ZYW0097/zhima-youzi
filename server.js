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
    notes: { type: String, required: false,  maxlength: 30},
});
reservationSchema.index({ phone: 1, date: 1, time: 1 }, { unique: true });

const { invalidPhoneNumbers } = JSON.parse(fs.readFileSync('pnb.json', 'utf-8'));
const invalidNumbersPattern = invalidPhoneNumbers.join('|');
const phoneRegex = new RegExp(`^09(?!${invalidNumbersPattern})\\d{8}$`);
const LINE_CLIENT_ID = process.env.LINE_CLIENT_ID;  // LINE 客戶端 ID
const LINE_CLIENT_SECRET = process.env.LINE_CLIENT_SECRET;  // LINE 客戶端密鑰
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
    const { name, phone, email, gender, date, time, adults, children, vegetarian, specialNeeds, notes } = req.body;
    const token = generateToken(8);
    const expiration = 120; 

    if (!phoneRegex.test(phone)) {
        return res.status(400).json({
          success: false,
          message: '電話格式不正確或為無效號碼，請使用台灣合法手機格式'
        });
      }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ success: false, message: '電子郵件格式不正確' });

    if (!time || time.trim() === "") return res.status(400).json({ success: false, message: '請選擇用餐時間。' });

    try {
        if (notes === "") {
            notes = null;
          }

        const reservation = new Reservation({ name, phone, email, gender, date, time, adults, children, vegetarian, specialNeeds, notes });
        await reservation.save();

        if (req.session.lineUserId) {
            const message = `
訂位成功通知！
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
                console.log('Sent LINE message to:', req.session.lineUserId);
            } catch (error) {
                console.error('Error sending LINE notification:', error);
                // 繼續處理，不中斷訂位流程
            }
        }

        await redisClient.set(token, JSON.stringify({
            name,
            phone,
            gender,
            date,
            time,
        }), 'EX', expiration);

        res.cookie('token', token, { httpOnly: true });
        console.log(`Token Created: ${token}, Expiration: ${expiration}s, User: ${name}, Time: ${new Date().toISOString()}`);
        
        res.json({ success: true, redirectUrl: `/${token}/success` });
    } catch (error) {
        res.status(500).json({ success: false, message: '訂位失敗，請稍後再試。', error: error.message });
    }
});

async function sendLineMessage(userId, message) {
    try {
        await axios.post('https://api.line.me/v2/bot/message/push', {
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
        console.log('LINE message sent successfully');
    } catch (error) {
        console.error('Error sending LINE message:', error);
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

    // ... 前面的驗證代碼保持不變 ...

    try {
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
        
        // 獲取用戶資料
        const profileResponse = await axios.get('https://api.line.me/v2/profile', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`
            }
        });

        const userProfile = profileResponse.data;
        
        // 將用戶 ID 存入 session
        req.session.lineUserId = userProfile.userId;
        console.log('Stored LINE userId:', userProfile.userId);

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
