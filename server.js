const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const { createClient } = require('redis');
const RedisStore = require('connect-redis').default;
const cookieParser = require('cookie-parser');
const { connectToDatabase, UserID } = require('./database');
const redisUrl = process.env.REDIS_URL;
const fs = require('fs');
const axios = require('axios');
const nodemailer = require('nodemailer');

const app = express();
const redisClient = createClient({
    url: redisUrl
  });
const transporter = nodemailer.createTransport({
    service: 'Gmail',  // 使用 Gmail
    auth: {
        user: process.env.EMAIL_USER,     // 你的 Gmail
        pass: process.env.EMAIL_PASSWORD  // 你的應用程式密碼
    }
});

const PORT = process.env.PORT || 3000;

require('dotenv').config();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cookieParser());
app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// MIME 類型中間件
app.use((req, res, next) => {
    if (req.path.endsWith('.css')) {
        res.type('text/css');
    } else if (req.path.endsWith('.js')) {
        res.type('application/javascript');
    } else if (req.path.endsWith('.ico')) {
        res.type('image/x-icon');
    }
    next();
});

// 添加在靜態文件中間件之後
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'images', 'logo.ico'));
});

// 靜態文件中間件 - 注意順序
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(express.static(path.join(__dirname, 'html')));

// 路由設置
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'html', 'index.html')));
app.get('/form', (req, res) => res.sendFile(path.join(__dirname, 'html', 'form.html')));
app.get('/questions', (req, res) => res.sendFile(path.join(__dirname, 'html', 'questions.html')));
app.get('/menu', (req, res) => res.sendFile(path.join(__dirname, 'html', 'menu.html')));
app.get('/line', (req, res) => res.sendFile(path.join(__dirname, 'html', 'line.html')));

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
const REDIRECT_URI = 'https://zhima-youzi.onrender.com/line/line_callback';  // 您的回調 URL


const Reservation = mongoose.model('Reservation', reservationSchema, 'bookings');

function generateToken(length = 8) {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

async function sendEmail(toEmail, reservationData) {
    const {
        name,
        date,
        time,
        adults,
        children,
        vegetarian,
        specialNeeds,
        notes
    } = reservationData;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: '芝麻柚子 とんかつ | 訂位確認通知',
        html: `
            <div style="font-family: 'Microsoft JhengHei', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333;">訂位確認通知</h2>
                <p style="color: #666;">${name} 您好，</p>
                <p style="color: #666;">感謝您在芝麻柚子 とんかつ 訂位，以下是您的訂位資訊：</p>
                
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>訂位資訊：</strong></p>
                    <p style="margin: 5px 0;">姓名：${name}</p>
                    <p style="margin: 5px 0;">日期：${new Date(date).getFullYear()}/${String(new Date(date).getMonth() + 1).padStart(2, '0')}/${String(new Date(date).getDate()).padStart(2, '0')} (${['日', '一', '二', '三', '四', '五', '六'][new Date(date).getDay()]})</p>
                    <p style="margin: 5px 0;">時間：${time}</p>
                    <p style="margin: 5px 0;">人數：${adults}大${children}小</p>
                    <p style="margin: 5px 0;">素食：${vegetarian}</p>
                    <p style="margin: 5px 0;">特殊需求：${specialNeeds}</p>
                    <p style="margin: 5px 0;">備註：${notes || '無'}</p>
                </div>

                <p style="color: #666;">如需修改訂位，請提前來電告知。</p>
                <p style="color: #666;">期待您的光臨！</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                    <p style="color: #999; font-size: 14px;">芝麻柚子 とんかつ</p>
                    <p style="color: #999; font-size: 14px;">電話：03 558 7360</p>
                    <p style="color: #999; font-size: 14px;">地址：新竹縣竹北市光明一路490號</p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to:', toEmail);
    } catch (error) {
        console.error('Email sending error:', error);
        throw error;
    }
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
        
        await reservation.save();

        // 檢查電話號碼是否在 UserID 資料庫中
        const userID = await UserID.findOne({ phone });

        // 發送 Email
        await sendEmail(email, {
            name,
            date,
            time,
            adults,
            children,
            vegetarian,
            specialNeeds,
            notes
        });

        // 如果找到對應的 LINE 用戶，發送 LINE 通知
        if (userID) {
            const message = `
${userID.lineName}，您好！
訂位成功通知！

訂位資訊：
姓名：${name}
日期：${new Date(date).getFullYear()}/${String(new Date(date).getMonth() + 1).padStart(2, '0')}/${String(new Date(date).getDate()).padStart(2, '0')} (${['日', '一', '二', '三', '四', '五', '六'][new Date(date).getDay()]})
時間：${time}
人數：${adults}大${children}小
素食：${vegetarian}
特殊需求：${specialNeeds}
備註：${notes || '無'}

感謝您的訂位！
            `.trim();

            try {
                await sendLineMessage(userID.lineUserId, message);
                console.log('LINE notification sent successfully');
            } catch (error) {
                console.error('LINE notification error:', error);
            }
        }

        await redisClient.set(token, JSON.stringify({
            name, phone, email, gender, date, time,
        }), 'EX', expiration);

        res.cookie('token', token, { httpOnly: true });
        res.json({ success: true, redirectUrl: `/${token}/success` });

    } catch (error) {
        console.error('Reservation error details:', error);
        res.status(500).json({ 
            success: false, 
            message: '訂位失敗，請稍後再試。', 
            error: error.message,
            details: error.name === 'ValidationError' ? '資料驗證失敗' : '系統錯誤'
        });
    }
});

app.get('/line/line_callback', async (req, res) => {
    console.log('Received callback with query:', req.query);
    const { code, state, error, error_description } = req.query;

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
        // 獲取訪問令牌
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            client_id: LINE_CLIENT_ID,
            client_secret: LINE_CLIENT_SECRET
        });

        const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token', 
            params.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const tokenData = tokenResponse.data;
        const idToken = tokenData.id_token;
        const [, payload] = idToken.split('.');
        const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());
        
        const lineUserId = decodedPayload.sub;
        const lineName = decodedPayload.name;

        // 儲存到 session
        req.session.lineUserId = lineUserId;
        req.session.lineName = lineName;

        // 查找最近的訂位記錄
        const recentReservation = await Reservation.findOne().sort({ createdAt: -1 });
        
        if (recentReservation) {
            // 檢查是否已存在該用戶
            let userID = await UserID.findOne({ lineUserId });
            
            if (!userID) {
                // 創建新的用戶記錄
                userID = new UserID({
                    lineUserId,
                    lineName,
                    phone: recentReservation.phone
                });
                await userID.save();

                // 發送綁定成功通知
                const message = `
${lineName}，您好！
感謝您綁定 LINE 通知！
未來將透過 LINE 發送訂位相關通知。
                
訂位資訊：
姓名：${recentReservation.name}
日期：${new Date(recentReservation.date).getFullYear()}/${String(new Date(recentReservation.date).getMonth() + 1).padStart(2, '0')}/${String(new Date(recentReservation.date).getDate()).padStart(2, '0')} (${['日', '一', '二', '三', '四', '五', '六'][new Date(recentReservation.date).getDay()]})
時間：${recentReservation.time}
人數：${recentReservation.adults}大${recentReservation.children}小
素食：${recentReservation.vegetarian}
特殊需求：${recentReservation.specialNeeds}
備註：${recentReservation.notes || '無'}
                
感謝您的訂位！
                `.trim();

                await sendLineMessage(lineUserId, message);
            }
        }

        res.redirect('/');

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: '處理失敗',
            details: error.response?.data || error.message
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

app.get('/get-line-state', (req, res) => {
    const state = generateState();
    req.session.state = state;
    res.json({ state });
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
