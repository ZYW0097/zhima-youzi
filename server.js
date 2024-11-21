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
    service: 'Gmail', 
    auth: {
        user: process.env.EMAIL_USER,    
        pass: process.env.EMAIL_PASSWORD  
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
    cookie: { 
        maxAge: 120000
    }
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

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

app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'images', 'logo.ico'));
});

app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(express.static(path.join(__dirname, 'html')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'html', 'index.html')));
app.get('/form', (req, res) => res.sendFile(path.join(__dirname, 'html', 'form.html')));
app.get('/questions', (req, res) => res.sendFile(path.join(__dirname, 'html', 'questions.html')));
app.get('/menu', (req, res) => res.sendFile(path.join(__dirname, 'html', 'menu.html')));
app.get('/line', (req, res) => res.sendFile(path.join(__dirname, 'html', 'line.html')));
app.use('/line-c', (req, res, next) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(req.headers['user-agent']);
    
    const authTime = req.session.lineAuthTime || 0;
    const tenMinutes = 10 * 60 * 1000;
    const isAuthValid = (Date.now() - authTime) < tenMinutes;
    
    const hasLineAuth = req.session.lineUserId && req.session.lineName;
    const hasReservation = req.session.reservationSubmitted;

    if (isMobile || !hasLineAuth || !hasReservation || !isAuthValid) {
        return res.redirect('/');
    }

    next();
});
app.get('/line-c', (req, res) => res.sendFile(path.join(__dirname, 'html', 'line-c.html')));

connectToDatabase();
redisClient.connect().catch(console.error);


// const reservationSchema = new mongoose.Schema({
//     name: { type: String, required: true },
//     phone: { type: String, required: true },
//     email: { type: String, required: true },
//     gender: { type: String, required: true },
//     date: { type: String, required: true },
//     time: { type: String, required: true },
//     adults: { type: Number, required: true },
//     children: { type: Number, required: true },
//     vegetarian: { type: String, default: '否' },
//     specialNeeds: { type: String, default: '無' },
//     notes: { 
//         type: String, 
//         required: false,  
//         default: '無',    
//         maxlength: 30
//     },
//     reservationToken: { type: String }, 
//     sessionId: { type: String },        
//     createdAt: { type: Date, default: Date.now }  
// });

// reservationSchema.index({ phone: 1, date: 1, time: 1 }, { unique: true });

const { invalidPhoneNumbers } = JSON.parse(fs.readFileSync('pnb.json', 'utf-8'));
const invalidNumbersPattern = invalidPhoneNumbers.join('|');
const phoneRegex = new RegExp(`^09(?!${invalidNumbersPattern})\\d{8}$`);
const LINE_CLIENT_ID = process.env.LINE_CLIENT_ID;  
const LINE_CLIENT_SECRET = process.env.LINE_CLIENT_SECRET;  
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const REDIRECT_URI = 'https://zhima-youzi.onrender.com/line/line_callback'; 


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

    const displayDate = date.replace(/-/g, '/');
    const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][new Date(date).getDay()];

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
                    <p style="margin: 5px 0;">日期：${displayDate} (${dayOfWeek})</p>
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
    console.log('Received reservation request:', req.body);
    console.log('Session LINE info:', {
        userId: req.session.lineUserId,
        name: req.session.lineName
    });

    const { name, phone, email, gender, date, time, adults, children, vegetarian, specialNeeds, notes } = req.body;
    const sessionId = req.session.id;
    const reservationToken = generateToken(8);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(req.headers['user-agent']);

    // 日期調整
    const [year, month, day] = date.split('-').map(Number);
    let adjustedYear = year;
    let adjustedMonth = month;
    let adjustedDay = day + 1;

    const lastDayOfMonth = new Date(year, month, 0).getDate();
    if (adjustedDay > lastDayOfMonth) {
        adjustedDay = 1;
        adjustedMonth++;
        
        if (adjustedMonth > 12) {
            adjustedMonth = 1;
            adjustedYear++;
        }
    }

    const adjustedDate = `${adjustedYear}-${String(adjustedMonth).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}`;

    try {
        // 檢查電話是否已經被綁定到 LINE
        const existingLineUser = await UserID.findOne({ phone });
        
        // 建立基本訂位資料
        const reservationData = {
            name, phone, email, gender, 
            date: adjustedDate, time,
            adults, children, 
            vegetarian, specialNeeds, notes,
            reservationToken,
            sessionId,
            createdAt: new Date()
        };

        // 檢查是否有重複訂位
        const existingReservation = await Reservation.findOne({
            phone,
            date: adjustedDate,
            time
        });

        if (existingReservation) {
            return res.status(400).json({
                success: false,
                message: '您已經在相同時段有訂位了'
            });
        }

        // 儲存到資料庫
        const reservation = new Reservation(reservationData);
        await reservation.save();

        // 儲存到 Redis (2分鐘過期)
        await redisClient.set(reservationToken, JSON.stringify({
            ...reservationData,
            createdAt: new Date().toISOString()
        }), 'EX', 120);

        // 如果已有 LINE ID，建立關聯 (2分鐘過期)
        if (req.session.lineUserId) {
            await redisClient.set(`line_reservation_${req.session.lineUserId}`, 
                reservationToken, 'EX', 120);
        }

        // 發送 Email
        await sendEmail(email, {
            name,
            date: adjustedDate,
            time,
            adults,
            children,
            vegetarian,
            specialNeeds,
            notes
        });

        // 如果已綁定 LINE，發送 LINE 通知
        if (existingLineUser) {
            const displayDate = adjustedDate.replace(/-/g, '/');
            const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][new Date(adjustedDate).getDay()];
            const message = `
${existingLineUser.lineName}，您好！
訂位成功通知！

訂位資訊：
姓名：${name}
日期：${displayDate} (${dayOfWeek})
時間：${time}
人數：${adults}大${children}小
素食：${vegetarian}
特殊需求：${specialNeeds}
備註：${notes || '無'}

感謝您的訂位！
            `.trim();

            try {
                await sendLineMessage(existingLineUser.lineUserId, message);
                console.log('LINE notification sent successfully');
            } catch (error) {
                console.error('LINE notification error:', error);
                // LINE 通知失敗不影響訂位流程
            }
        }

        // 統一回應格式
        res.json({
            success: true,
            redirectUrl: `/${reservationToken}/success`
        });

    } catch (error) {
        console.error('Reservation error:', error);
        res.status(500).json({
            success: false,
            message: '訂位失敗，請稍後再試。',
            error: error.message
        });
    }
});

app.get('/line/callback', async (req, res) => {
    console.log('LINE Login callback received:', req.query);
    
    try {
        // 獲取 code
        const code = req.query.code;
        if (!code) {
            console.error('No code received');
            return res.redirect('/form?error=no_code');
        }

        // 交換 access token
        const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token', 
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: LINE_CALLBACK_URL,
                client_id: LINE_LOGIN_CHANNEL_ID,
                client_secret: LINE_LOGIN_CHANNEL_SECRET
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        // 獲取用戶資料
        const profileResponse = await axios.get('https://api.line.me/v2/profile', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const lineUserId = profileResponse.data.userId;
        const lineName = profileResponse.data.displayName;

        // 從 cookie 中獲取 reservationToken
        const reservationToken = req.cookies.reservationToken;
        if (!reservationToken) {
            console.error('No reservation token in cookie');
            return res.redirect('/form?error=no_token');
        }

        // 從 Redis 獲取訂位資料
        const reservationData = await redisClient.get(reservationToken);
        if (!reservationData) {
            console.error('No reservation data found for token:', reservationToken);
            return res.redirect('/form?error=invalid_token');
        }

        const reservation = JSON.parse(reservationData);

        // 檢查是否已經綁定
        const existingUser = await UserID.findOne({ 
            $or: [
                { lineUserId },
                { phone: reservation.phone }
            ]
        });

        if (existingUser) {
            console.log('User already exists:', existingUser);
            return res.redirect('/line-c.html?status=already_bound');
        }

        // 儲存 LINE 用戶 ID 到 Redis（2分鐘過期）
        await redisClient.set(`line_reservation_${lineUserId}`, reservationToken, 'EX', 120);

        // 重定向到完成頁面
        res.redirect('/line-c.html?status=success');

    } catch (error) {
        console.error('LINE Login callback error:', error);
        res.redirect('/form?error=login_failed');
    }
});

app.post('/line/webhook', async (req, res) => {
    console.log('Received webhook:', JSON.stringify(req.body, null, 2));
    
    try {
        const events = req.body.events;
        for (const event of events) {
            const lineUserId = event.source.userId;
            
            // 檢查用戶是否在資料庫中
            const existingUser = await UserID.findOne({ lineUserId });
            
            // 如果用戶不在資料庫中，檢查是否有訂位
            if (!existingUser) {
                // 檢查是否有待綁定的訂位
                const reservationToken = await redisClient.get(`line_reservation_${lineUserId}`);
                if (reservationToken) {
                    // 情況一：不在 userid 資料庫但有訂位
                    const reservationData = await redisClient.get(reservationToken);
                    if (reservationData) {
                        const reservation = JSON.parse(reservationData);
                        
                        // 獲取 LINE 用戶資料
                        const userProfile = await axios.get(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
                            headers: {
                                'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
                            }
                        });
                        const lineName = userProfile.data.displayName;
                        
                        // 檢查電話是否已被綁定
                        const existingBinding = await UserID.findOne({ phone: reservation.phone });
                        if (!existingBinding) {
                            // 建立新的綁定
                            const newUserID = new UserID({
                                lineUserId,
                                lineName,
                                phone: reservation.phone
                            });
                            await newUserID.save();

                            // 發送訂位資訊
                            const displayDate = reservation.date.replace(/-/g, '/');
                            const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][new Date(reservation.date).getDay()];
                            const reservationMessage = `
${lineName}，您好！
已完成 LINE 綁定，您的訂位資訊如下：

姓名：${reservation.name}
日期：${displayDate} (${dayOfWeek})
時間：${reservation.time}
人數：${reservation.adults}大${reservation.children}小
素食：${reservation.vegetarian}
特殊需求：${reservation.specialNeeds}
備註：${reservation.notes || '無'}

感謝您的訂位！
                            `.trim();

                            await sendLineMessage(lineUserId, reservationMessage);
                        }
                    }
                }
            }

            // 處理加入好友事件
            if (event.type === 'follow') {
                const userProfile = await axios.get(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
                    headers: {
                        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
                    }
                });
                
                const lineName = userProfile.data.displayName;
                
                if (!existingUser) {
                    // 檢查是否有相應的訂位（2分鐘內）
                    const recentReservation = await Reservation.findOne({ 
                        createdAt: { 
                            $gte: new Date(Date.now() - 120000)
                        }
                    }).sort({ createdAt: -1 });

                    if (recentReservation) {
                        // 如果有最近的訂位，發送提示輸入電話的訊息
                        const welcomeMessage = `${lineName}，您好！\n歡迎加入芝麻柚子！\n如果您剛剛完成訂位，請輸入訂位時使用的手機號碼。`;
                        await sendLineMessage(lineUserId, welcomeMessage);
                    } else {
                        // 如果沒有最近的訂位，只發送一般歡迎訊息
                        const welcomeMessage = `${lineName}，您好！\n歡迎加入芝麻柚子！`;
                        await sendLineMessage(lineUserId, welcomeMessage);
                    }
                }
            }
        }
        res.status(200).end();
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).end();
    }
});

async function sendLineMessage(userId, message) {
    if (!CHANNEL_ACCESS_TOKEN) {
        console.error('CHANNEL_ACCESS_TOKEN is missing');  
        throw new Error('LINE messaging configuration is incomplete');
    }

    try {
        console.log('Sending LINE message to:', userId);  
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
        console.log('LINE API response:', response.data); 
        return response.data;
    } catch (error) {
        console.error('LINE message error details:', {  
            error: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        throw error;
    }
}

app.get('/get-line-state', (req, res) => {
    try {
        const state = generateState();
        req.session.lineState = state;
        res.json({ state });
    } catch (error) {
        console.error('Error generating LINE state:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/reservation-data/:token', async (req, res) => {
    try {
        const token = req.params.token;
        
        // 從 Redis 獲取訂位資料
        const reservationData = await redisClient.get(token);
        if (!reservationData) {
            console.error('No reservation data found for token:', token);
            return res.status(404).json({ error: 'Reservation not found' });
        }

        // 解析並返回訂位資料
        const reservation = JSON.parse(reservationData);
        res.json(reservation);

    } catch (error) {
        console.error('Error getting reservation data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API 路由 - 檢查 LINE 綁定狀態
app.get('/api/line-status/:phone', async (req, res) => {
    try {
        const phone = req.params.phone;
        
        // 檢查是否已經綁定
        const existingUser = await UserID.findOne({ phone });
        
        res.json({
            bound: !!existingUser,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Error checking LINE status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// app.post('/api/cleanup', async (req, res) => {
//     try {
//         const keys = await redisClient.keys('line_*');
//         for (const key of keys) {
//             const ttl = await redisClient.ttl(key);
//             if (ttl <= 0) {
//                 await redisClient.del(key);
//             }
//         }
//         res.json({ success: true });
//     } catch (error) {
//         console.error('Error cleaning up Redis:', error);
//         res.status(500).json({ error: 'Internal server error' });
//     }
// });

app.get('/:token/success', async (req, res) => {
    const token = req.params.token;
    try {
        // 先檢查 Redis
        let reservationData = await redisClient.get(token);
        
        if (!reservationData) {
            // 如果 Redis 沒有，檢查資料庫
            const reservation = await Reservation.findOne({ reservationToken: token });
            if (!reservation) {
                console.error('No reservation found for token:', token);
                return res.redirect('/form?error=invalid_token');
            }
            reservationData = JSON.stringify(reservation);
        }

        // 解析預訂資料
        const parsedData = JSON.parse(reservationData);
        
        // 檢查是否已經有 LINE 綁定
        const existingLineUser = await UserID.findOne({ phone: parsedData.phone });
        
        // 設定 cookie 用於 LINE 綁定 (2分鐘)
        res.cookie('reservationToken', token, { 
            maxAge: 120000,
            httpOnly: true 
        });

        // 渲染成功頁面
        res.sendFile(path.join(__dirname, 'html', 'success.html'));

        // 設定定時器清理 Redis 資料 (2分鐘)
        setTimeout(async () => {
            await redisClient.del(token);
            console.log(`Token Deleted: ${token}, Time: ${new Date().toISOString()}`);
        }, 120000);

    } catch (error) {
        console.error('Error in success page:', error);
        res.redirect('/form?error=server_error');
    }
});

app.get('/line/mobile-redirect', async (req, res) => {
    const token = req.query.token;
    if (!token) {
        console.error('No token provided for mobile redirect');
        return res.redirect('/');
    }

    try {
        let reservationData = await redisClient.get(token);
        if (!reservationData) {
            reservationData = await redisClient.get(`mobile_${token}`);
        }

        if (!reservationData) {
            console.error('No reservation data found for token:', token);
            return res.redirect('/');
        }

        const parsedData = JSON.parse(reservationData);
        
        const latestReservation = await Reservation.findOne({ 
            phone: parsedData.phone 
        }).sort({ _id: -1 }); 

        if (latestReservation) {
            parsedData._id = latestReservation._id;
        }

        const tokenKey = reservationData ? token : `mobile_${token}`;
        await redisClient.set(tokenKey, JSON.stringify(parsedData), 'EX', 120);
        
        console.log('Redirecting to LINE with updated data:', parsedData);
        res.redirect('https://lin.ee/qzdxu8d');
    } catch (error) {
        console.error('Error in mobile redirect:', error);
        res.redirect('/');
    }
});

app.get('/line/login', (req, res) => {
    // 從 cookie 中獲取 reservationToken
    const reservationToken = req.cookies.reservationToken;
    if (!reservationToken) {
        console.error('No reservation token in cookie');
        return res.redirect('/form?error=no_token');
    }

    // 生成 LINE Login URL
    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // 儲存 state 和 nonce 到 Redis（2分鐘過期）
    redisClient.set(`line_state_${state}`, nonce, 'EX', 120);

    const loginUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
    loginUrl.searchParams.append('response_type', 'code');
    loginUrl.searchParams.append('client_id', LINE_CLIENT_ID);
    loginUrl.searchParams.append('redirect_uri', LINE_CALLBACK_URL);
    loginUrl.searchParams.append('state', state);
    loginUrl.searchParams.append('scope', 'profile');
    loginUrl.searchParams.append('nonce', nonce);

    res.redirect(loginUrl.toString());
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
