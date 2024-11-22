const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const { createClient } = require('redis');
const RedisStore = require('connect-redis').default;
const cookieParser = require('cookie-parser');
const { connectToDatabase, UserID, Reservation } = require('./database');
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
// const LINE_CLIENT_ID = process.env.LINE_CLIENT_ID;  
// const LINE_CLIENT_SECRET = process.env.LINE_CLIENT_SECRET;  
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
// const REDIRECT_URI = 'https://zhima-youzi.onrender.com/line/line_callback'; 


// const Reservation = mongoose.model('Reservation', reservationSchema, 'bookings');

function generateToken(length = 8) {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
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
    
    const { name, phone, email, gender, date, time, adults, children, vegetarian, specialNeeds, notes } = req.body;
    const token = generateToken();

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
        const existingLineUser = await UserID.findOne({ phone });
        
        const reservationData = {
            name, phone, email, gender, 
            date: adjustedDate, time,
            adults, children, 
            vegetarian, specialNeeds, notes,
        };

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

        const reservation = new Reservation(reservationData);
        await reservation.save();

        await redisClient.set(token, JSON.stringify({
            ...reservationData,
            createdAt: new Date().toISOString()
        }), 'EX', 120);

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

        if (existingLineUser) {
            const message = `
${existingLineUser.lineName}，您好！
訂位成功通知！

訂位資訊：
姓名：${name}
日期：${adjustedDate.replace(/-/g, '/')}
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
            }
        }

        res.json({
            success: true,
            redirectUrl: `/${token}/success`
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

app.post('/line/webhook', async (req, res) => {
    console.log('Received webhook:', JSON.stringify(req.body, null, 2));
    
    try {
        const events = req.body.events;
        for (const event of events) {
            const lineUserId = event.source.userId;
            
            // 1. 處理加入好友事件
            if (event.type === 'follow') {
                const userProfile = await axios.get(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
                    headers: {
                        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
                    }
                });
                const lineName = userProfile.data.displayName;
                
                // 檢查用戶是否已綁定
                const existingUser = await UserID.findOne({ lineUserId });
                
                if (!existingUser) {
                    const welcomeMessage = `${lineName}您好！
我是芝麻柚子。
感謝您加入好友\uDBC0\uDC78

此官方帳號將定期發放最新資訊給您\uDBC0\uDC6D

綁定電話號碼來獲取訂位資訊吧\uDBC0\uDC4A

\uDBC0\uDC4A\uDBC0\uDC4A\uDBC0\uDC4A請注意\uDBC0\uDC4A\uDBC0\uDC4A\uDBC0\uDC4A
如果已提交訂位，請輸入訂位時所使用的電話號碼，否則無法收到訂位資訊。`;

                    await sendLineMessage(lineUserId, {
                        type: 'template',
                        altText: '綁定電話號碼',
                        template: {
                            type: 'buttons',
                            text: welcomeMessage,
                            actions: [{
                                type: 'postback',
                                label: '綁定電話',
                                data: 'action=bind_phone'
                            }]
                        }
                    });
                }
            }

            // 2. 處理按鈕回應
            if (event.type === 'postback') {
                const data = new URLSearchParams(event.postback.data);
                const action = data.get('action');
                const phone = data.get('phone');

                switch (action) {
                    case 'bind_phone':
                        await sendLineMessage(lineUserId, '請輸入要綁定的電話號碼：');
                        break;

                    case 'confirm_recent_reservation':
                        try {
                            // 獲取用戶資料
                            const userProfile = await axios.get(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
                                headers: {
                                    'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
                                }
                            });

                            // 建立新的綁定
                            const newUserID = new UserID({
                                lineUserId,
                                lineName: userProfile.data.displayName,
                                phone
                            });
                            await newUserID.save();

                            // 獲取完整訂位資訊
                            const reservation = await Reservation.findOne({
                                phone,
                                createdAt: { 
                                    $gte: new Date(Date.now() - 120000)
                                }
                            });

                            if (reservation) {
                                const confirmMessage = `
電話號碼綁定成功！
以下是您的訂位資訊：

姓名：${reservation.name}
電話：${reservation.phone}
日期：${reservation.date.replace(/-/g, '/')}
時間：${reservation.time}
人數：${reservation.adults}大${reservation.children}小
素食：${reservation.vegetarian}
特殊需求：${reservation.specialNeeds}
備註：${reservation.notes || '無'}

感謝您的訂位！
                                `.trim();
                                await sendLineMessage(lineUserId, confirmMessage);
                            }
                        } catch (error) {
                            console.error('Error in confirm_recent_reservation:', error);
                            await sendLineMessage(lineUserId, '綁定過程發生錯誤，請稍後再試。');
                        }
                        break;

                    case 'confirm_general_binding':
                        try {
                            const userProfile = await axios.get(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
                                headers: {
                                    'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
                                }
                            });

                            const newUserID = new UserID({
                                lineUserId,
                                lineName: userProfile.data.displayName,
                                phone
                            });
                            await newUserID.save();

                            await sendLineMessage(lineUserId, '電話號碼綁定成功！未來訂位時將會收到通知。');
                        } catch (error) {
                            console.error('Error in confirm_general_binding:', error);
                            await sendLineMessage(lineUserId, '綁定過程發生錯誤，請稍後再試。');
                        }
                        break;

                    case 'cancel_binding':
                        await sendLineMessage(lineUserId, '已取消綁定。');
                        break;
                }
            }

            // 3. 處理電話號碼輸入
            if (event.type === 'message' && event.message.type === 'text') {
                const phone = event.message.text;
                
                // 驗證電話號碼格式
                if (!phoneRegex.test(phone)) {
                    await sendLineMessage(lineUserId, '請輸入有效的手機號碼（例：0912345678）');
                    return;
                }

                // 檢查是否已經綁定
                const existingBinding = await UserID.findOne({ phone });
                if (existingBinding) {
                    await sendLineMessage(lineUserId, '此電話號碼已經被綁定。');
                    return;
                }

                // 查詢2分鐘內的新訂位
                const recentReservation = await Reservation.findOne({
                    phone,
                    createdAt: { 
                        $gte: new Date(Date.now() - 120000)
                    }
                }).sort({ createdAt: -1 });

                if (recentReservation) {
                    // 發送遮罩後的訂位資訊確認
                    const maskedName = recentReservation.name.charAt(0) + '*'.repeat(recentReservation.name.length - 1);
                    const maskedPhone = `${phone.slice(0, 4)}**${phone.slice(-2)}`;
                    
                    await sendLineMessage(lineUserId, {
                        type: 'template',
                        altText: '確認訂位資訊',
                        template: {
                            type: 'confirm',
                            text: `請確認以下訂位資訊：\n姓名：${maskedName}\n電話：${maskedPhone}\n日期：${recentReservation.date}\n時間：${recentReservation.time}`,
                            actions: [
                                {
                                    type: 'postback',
                                    label: '確認',
                                    data: `action=confirm_recent_reservation&phone=${phone}`
                                },
                                {
                                    type: 'postback',
                                    label: '取消',
                                    data: 'action=cancel_binding'
                                }
                            ]
                        }
                    });
                } else {
                    // 發送一般綁定確認
                    await sendLineMessage(lineUserId, {
                        type: 'template',
                        altText: '確認綁定電話',
                        template: {
                            type: 'confirm',
                            text: `確認要綁定電話號碼 ${phone} 嗎？`,
                            actions: [
                                {
                                    type: 'postback',
                                    label: '確認',
                                    data: `action=confirm_general_binding&phone=${phone}`
                                },
                                {
                                    type: 'postback',
                                    label: '取消',
                                    data: 'action=cancel_binding'
                                }
                            ]
                        }
                    });
                }
            }
        }
        res.status(200).end();
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).end();
    }
});

async function sendLineMessage(to, message) {
    try {
        await axios.post('https://api.line.me/v2/bot/message/push', {
            to: to,
            messages: Array.isArray(message) ? message : [
                typeof message === 'string' ? { type: 'text', text: message } : message
            ]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
            }
        });
    } catch (error) {
        console.error('Error sending LINE message:', error.response?.data || error);
        throw error;
    }
}

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
