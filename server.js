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


const reservationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    gender: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    adults: { type: Number, required: true },
    children: { type: Number, required: true },
    vegetarian: { type: String, default: '否' },
    specialNeeds: { type: String, default: '無' },
    notes: { 
        type: String, 
        required: false,  
        default: '無',    
        maxlength: 30
    },
});
reservationSchema.index({ phone: 1, date: 1, time: 1 }, { unique: true });

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
    const token = generateToken(8);
    const expiration = 120;

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
        const reservation = new Reservation({ 
            name, phone, email, gender, date: adjustedDate, time, 
            adults, children, vegetarian, specialNeeds, notes 
        });
        
        await reservation.save();

        const userID = await UserID.findOne({ phone });

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

        if (userID) {
            const displayDate = adjustedDate.replace(/-/g, '/');
            const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][new Date(adjustedDate).getDay()];
            const message = `
${userID.lineName}，您好！
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
                await sendLineMessage(userID.lineUserId, message);
                console.log('LINE notification sent successfully');
            } catch (error) {
                console.error('LINE notification error:', error);
            }
        }

        await redisClient.set(token, JSON.stringify({
            name,
            phone,
            email,
            gender,
            date: adjustedDate,
            time,
            adults,
            children,
            vegetarian,
            specialNeeds,
            notes
        }), 'EX', expiration);

        req.session.reservationSubmitted = true;
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

        req.session.lineUserId = lineUserId;
        req.session.lineName = lineName;
        req.session.lineAuthTime = Date.now();

        const token = req.cookies.token;
        if (token) {
            const reservationData = await redisClient.get(token);
            if (reservationData) {
                const reservation = JSON.parse(reservationData);
                
                let userID = await UserID.findOne({ lineUserId });
                
                if (!userID) {
                    userID = new UserID({
                        lineUserId,
                        lineName,
                        phone: reservation.phone 
                    });
                    await userID.save();
                }
            }
        }

        const isMobile = /iPhone|iPad|iPod|Android/i.test(req.headers['user-agent']);
        if (!isMobile) {
            res.redirect('/line-c');
        } else {
            res.redirect('/');
        }

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: '處理失敗',
            details: error.response?.data || error.message
        });
    }
});

app.post('/line/webhook', async (req, res) => {
    try {
        const events = req.body.events;
        
        for (const event of events) {
            if (event.type === 'follow') {
                const lineUserId = event.source.userId;
                
                const userProfile = await axios.get(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
                    headers: {
                        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
                    }
                });
                
                const lineName = userProfile.data.displayName;
                
                const existingUser = await UserID.findOne({ lineUserId });
                
                if (existingUser) {
                    const reservation = await Reservation.findOne({ 
                        phone: existingUser.phone 
                    }).sort({ date: -1, time: -1 });
                    
                    if (reservation) {
                        const displayDate = reservation.date.replace(/-/g, '/');
                        const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][new Date(reservation.date).getDay()];
                        const message = `
${lineName}，您好！
以下是您的訂位資訊：

姓名：${reservation.name}
日期：${displayDate} (${dayOfWeek})
時間：${reservation.time}
人數：${reservation.adults}大${reservation.children}小
素食：${reservation.vegetarian}
特殊需求：${reservation.specialNeeds}
備註：${reservation.notes || '無'}
                        `.trim();
                        
                        await sendLineMessage(lineUserId, message);
                    }
                } else {
                    const keys = await redisClient.keys('mobile_*');
                    
                    for (const key of keys) {
                        const reservationData = await redisClient.get(key.replace('mobile_', ''));
                        if (reservationData) {
                            const reservation = JSON.parse(reservationData);
                            
                            try {

                                const userID = new UserID({
                                    lineUserId,
                                    lineName,
                                    phone: reservation.phone
                                });
                                await userID.save();
                                console.log('Successfully saved user to UserID database:', userID);
                                
                                const displayDate = reservation.date.replace(/-/g, '/');
                                const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][new Date(reservation.date).getDay()];
                                const message = `
${lineName}，您好！
感謝您加入芝麻柚子 とんかつ！
已為您開啟 LINE 通知服務。

訂位資訊：
姓名：${reservation.name}
日期：${displayDate} (${dayOfWeek})
時間：${reservation.time}
人數：${reservation.adults}大${reservation.children}小
素食：${reservation.vegetarian}
特殊需求：${reservation.specialNeeds}
備註：${reservation.notes || '無'}

未來將透過 LINE 發送訂位相關通知，感謝您的支持！
                                `.trim();
                                
                                await sendLineMessage(lineUserId, message);
                                await redisClient.del(key);
                                break;
                            } catch (error) {
                                console.error('Error saving to UserID database:', error);
                                throw error;
                            }
                        }
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

app.get('/line/mobile-redirect', async (req, res) => {
    const token = req.query.token;
    if (token) {
        await redisClient.set(`mobile_${token}`, 'pending', 'EX', 300);
    }
    res.redirect('https://lin.ee/qzdxu8d');
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
