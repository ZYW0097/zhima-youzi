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

app.use((req, res, next) => {
    if (req.path.endsWith('.js')) {
        res.type('application/javascript');
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
            try {
                await sendLineMessage(existingLineUser.lineUserId, {
                    type: 'flex',
                    altText: '訂位成功通知',
                    contents: {
                        "type": "bubble",
                        "header": {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "box",
                                    "layout": "horizontal",
                                    "contents": [
                                        {
                                            "type": "text",
                                            "text": "訂位成功通知！",
                                            "color": "#ffffff",
                                            "align": "center",
                                            "gravity": "center",
                                            "size": "lg",
                                            "flex": 4,
                                            "weight": "bold"
                                        }
                                    ],
                                    "alignItems": "center"
                                }
                            ],
                            "backgroundColor": "#66BB6A",
                            "paddingAll": "20px"
                        },
                        "body": {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": `${existingLineUser.lineName}，您好！`,
                                    "weight": "bold",
                                    "size": "md",
                                    "wrap": true,
                                    "color": "#2E4A62",
                                    "margin": "md"
                                },
                                {
                                    "type": "box",
                                    "layout": "vertical",
                                    "margin": "lg",
                                    "spacing": "sm",
                                    "contents": [
                                        {
                                            "type": "box",
                                            "layout": "horizontal",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": "姓名",
                                                    "size": "sm",
                                                    "color": "#555555",
                                                    "flex": 3
                                                },
                                                {
                                                    "type": "text",
                                                    "text": name,
                                                    "size": "sm",
                                                    "color": "#111111",
                                                    "flex": 7,
                                                    "wrap": true
                                                }
                                            ]
                                        },
                                        {
                                            "type": "box",
                                            "layout": "horizontal",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": "日期",
                                                    "size": "sm",
                                                    "color": "#555555",
                                                    "flex": 3
                                                },
                                                {
                                                    "type": "text",
                                                    "text": adjustedDate.replace(/-/g, '/'),
                                                    "size": "sm",
                                                    "color": "#111111",
                                                    "flex": 7,
                                                    "wrap": true
                                                }
                                            ],
                                            "margin": "md"
                                        },
                                        {
                                            "type": "box",
                                            "layout": "horizontal",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": "時間",
                                                    "size": "sm",
                                                    "color": "#555555",
                                                    "flex": 3
                                                },
                                                {
                                                    "type": "text",
                                                    "text": time,
                                                    "size": "sm",
                                                    "color": "#111111",
                                                    "flex": 7,
                                                    "wrap": true
                                                }
                                            ],
                                            "margin": "md"
                                        },
                                        {
                                            "type": "box",
                                            "layout": "horizontal",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": "人數",
                                                    "size": "sm",
                                                    "color": "#555555",
                                                    "flex": 3
                                                },
                                                {
                                                    "type": "text",
                                                    "text": `${adults}大${children}小`,
                                                    "size": "sm",
                                                    "color": "#111111",
                                                    "flex": 7,
                                                    "wrap": true
                                                }
                                            ],
                                            "margin": "md"
                                        },
                                        {
                                            "type": "box",
                                            "layout": "horizontal",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": "素食",
                                                    "size": "sm",
                                                    "color": "#555555",
                                                    "flex": 3
                                                },
                                                {
                                                    "type": "text",
                                                    "text": vegetarian,
                                                    "size": "sm",
                                                    "color": "#111111",
                                                    "flex": 7,
                                                    "wrap": true
                                                }
                                            ],
                                            "margin": "md"
                                        },
                                        {
                                            "type": "box",
                                            "layout": "horizontal",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": "特殊需求",
                                                    "size": "sm",
                                                    "color": "#555555",
                                                    "flex": 3
                                                },
                                                {
                                                    "type": "text",
                                                    "text": specialNeeds,
                                                    "size": "sm",
                                                    "color": "#111111",
                                                    "flex": 7,
                                                    "wrap": true
                                                }
                                            ],
                                            "margin": "md"
                                        },
                                        {
                                            "type": "box",
                                            "layout": "horizontal",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": "備註",
                                                    "size": "sm",
                                                    "color": "#555555",
                                                    "flex": 3
                                                },
                                                {
                                                    "type": "text",
                                                    "text": notes || '無',
                                                    "size": "sm",
                                                    "color": "#111111",
                                                    "flex": 7,
                                                    "wrap": true
                                                }
                                            ],
                                            "margin": "md"
                                        }
                                    ]
                                }
                            ],
                            "paddingAll": "20px"
                        },
                        "footer": {
                            "type": "box",
                            "layout": "vertical",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "感謝您的訂位！",
                                    "align": "center",
                                    "color": "#66BB6A",
                                    "weight": "bold"
                                }
                            ],
                            "paddingAll": "20px"
                        }
                    }
                });
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
                    await sendLineMessage(lineUserId, {
                        type: 'flex',
                        altText: '歡迎加入芝麻柚子 とんかつ官方帳號',
                        contents: {
                            "type": "bubble",
                            "header": {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {
                                        "type": "box",
                                        "layout": "horizontal",
                                        "contents": [
                                            {
                                                "type": "image",
                                                "url": "https://raw.githubusercontent.com/ZYW0097/zhima-youzi/refs/heads/main/images/logo-circle.png",
                                                "size": "sm",
                                                "aspectRatio": "1:1",
                                                "flex": 1
                                            },
                                            {
                                                "type": "text",
                                                "text": "芝麻柚子 とんかつ",
                                                "color": "#ffffff",
                                                "align": "center",
                                                "gravity": "center",
                                                "size": "lg",
                                                "flex": 4,
                                                "weight": "bold"
                                            }
                                        ],
                                        "alignItems": "center"
                                    }
                                ],
                                "backgroundColor": "#66BB6A",
                                "paddingAll": "20px"
                            },
                            "body": {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "歡迎加入好友！",
                                        "weight": "bold",
                                        "size": "xl",
                                        "align": "center",
                                        "color": "#2E4A62"
                                    },
                                    {
                                        "type": "box",
                                        "layout": "vertical",
                                        "margin": "lg",
                                        "spacing": "sm",
                                        "contents": [
                                            {
                                                "type": "box",
                                                "layout": "baseline",
                                                "spacing": "md",
                                                "contents": [
                                                    {
                                                        "type": "text",
                                                        "text": "將定期發放最新資訊給您✨",
                                                        "wrap": true,
                                                        "color": "#666666",
                                                        "size": "md",
                                                        "flex": 5,
                                                        "align": "center"
                                                    }
                                                ]
                                            },
                                            {
                                                "type": "box",
                                                "layout": "baseline",
                                                "spacing": "md",
                                                "contents": [
                                                    {
                                                        "type": "text",
                                                        "text": "綁定電話號碼來獲取訂位資訊📧",
                                                        "wrap": true,
                                                        "color": "#666666",
                                                        "size": "md",
                                                        "flex": 5,
                                                        "align": "center"
                                                    }
                                                ],
                                                "margin": "md"
                                            }
                                        ]
                                    },
                                    {
                                        "type": "box",
                                        "layout": "vertical",
                                        "margin": "xxl",
                                        "contents": [
                                            {
                                                "type": "text",
                                                "text": "‼請注意‼",
                                                "size": "lg",
                                                "color": "#ff5551",
                                                "weight": "bold",
                                                "align": "center"
                                            },
                                            {
                                                "type": "text",
                                                "text": "請輸入訂位時使用的電話號碼",
                                                "margin": "sm",
                                                "size": "xs",
                                                "color": "#ff5551",
                                                "wrap": true,
                                                "align": "center"
                                            },
                                            {
                                                "type": "text",
                                                "text": "以確保能收到訂位資訊。",
                                                "margin": "sm",
                                                "size": "xs",
                                                "color": "#ff5551",
                                                "align": "center"
                                            }
                                        ],
                                        "paddingAll": "13px",
                                        "backgroundColor": "#FFF0F0",
                                        "cornerRadius": "2px"
                                    }
                                ],
                                "paddingAll": "20px"
                            },
                            "footer": {
                                "type": "box",
                                "layout": "vertical",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "button",
                                        "style": "primary",
                                        "height": "sm",
                                        "action": {
                                            "type": "postback",
                                            "label": "綁定電話號碼",
                                            "data": "action=bind_phone"
                                        },
                                        "color": "#66BB6A"
                                    }
                                ],
                                "flex": 0,
                                "paddingAll": "20px"
                            }
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
                                await sendLineMessage(lineUserId, {
                                    type: 'flex',
                                    altText: '電話號碼綁定成功',
                                    contents: {
                                        "type": "bubble",
                                        "header": {
                                            "type": "box",
                                            "layout": "vertical",
                                            "contents": [
                                                {
                                                    "type": "box",
                                                    "layout": "horizontal",
                                                    "contents": [
                                                        {
                                                            "type": "text",
                                                            "text": "電話號碼綁定成功！",
                                                            "color": "#ffffff",
                                                            "align": "center",
                                                            "gravity": "center",
                                                            "size": "lg",
                                                            "flex": 4,
                                                            "weight": "bold"
                                                        }
                                                    ],
                                                    "alignItems": "center"
                                                }
                                            ],
                                            "backgroundColor": "#66BB6A",
                                            "paddingAll": "20px"
                                        },
                                        "body": {
                                            "type": "box",
                                            "layout": "vertical",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": "以下是您的訂位資訊：",
                                                    "weight": "bold",
                                                    "size": "md",
                                                    "wrap": true,
                                                    "align": "center",
                                                    "color": "#2E4A62",
                                                    "margin": "md"
                                                },
                                                {
                                                    "type": "box",
                                                    "layout": "vertical",
                                                    "margin": "lg",
                                                    "spacing": "sm",
                                                    "contents": [
                                                        {
                                                            "type": "box",
                                                            "layout": "horizontal",
                                                            "contents": [
                                                                {
                                                                    "type": "text",
                                                                    "text": "姓名",
                                                                    "size": "sm",
                                                                    "color": "#555555",
                                                                    "flex": 3
                                                                },
                                                                {
                                                                    "type": "text",
                                                                    "text": reservation.name,
                                                                    "size": "sm",
                                                                    "color": "#111111",
                                                                    "flex": 7,
                                                                    "wrap": true
                                                                }
                                                            ]
                                                        },
                                                        {
                                                            "type": "box",
                                                            "layout": "horizontal",
                                                            "contents": [
                                                                {
                                                                    "type": "text",
                                                                    "text": "電話",
                                                                    "size": "sm",
                                                                    "color": "#555555",
                                                                    "flex": 3
                                                                },
                                                                {
                                                                    "type": "text",
                                                                    "text": reservation.phone,
                                                                    "size": "sm",
                                                                    "color": "#111111",
                                                                    "flex": 7,
                                                                    "wrap": true
                                                                }
                                                            ],
                                                            "margin": "md"
                                                        },
                                                        {
                                                            "type": "box",
                                                            "layout": "horizontal",
                                                            "contents": [
                                                                {
                                                                    "type": "text",
                                                                    "text": "日期",
                                                                    "size": "sm",
                                                                    "color": "#555555",
                                                                    "flex": 3
                                                                },
                                                                {
                                                                    "type": "text",
                                                                    "text": reservation.date.replace(/-/g, '/'),
                                                                    "size": "sm",
                                                                    "color": "#111111",
                                                                    "flex": 7,
                                                                    "wrap": true
                                                                }
                                                            ],
                                                            "margin": "md"
                                                        },
                                                        {
                                                            "type": "box",
                                                            "layout": "horizontal",
                                                            "contents": [
                                                                {
                                                                    "type": "text",
                                                                    "text": "時間",
                                                                    "size": "sm",
                                                                    "color": "#555555",
                                                                    "flex": 3
                                                                },
                                                                {
                                                                    "type": "text",
                                                                    "text": reservation.time,
                                                                    "size": "sm",
                                                                    "color": "#111111",
                                                                    "flex": 7,
                                                                    "wrap": true
                                                                }
                                                            ],
                                                            "margin": "md"
                                                        },
                                                        {
                                                            "type": "box",
                                                            "layout": "horizontal",
                                                            "contents": [
                                                                {
                                                                    "type": "text",
                                                                    "text": "人數",
                                                                    "size": "sm",
                                                                    "color": "#555555",
                                                                    "flex": 3
                                                                },
                                                                {
                                                                    "type": "text",
                                                                    "text": `${reservation.adults}大${reservation.children}小`,
                                                                    "size": "sm",
                                                                    "color": "#111111",
                                                                    "flex": 7,
                                                                    "wrap": true
                                                                }
                                                            ],
                                                            "margin": "md"
                                                        },
                                                        {
                                                            "type": "box",
                                                            "layout": "horizontal",
                                                            "contents": [
                                                                {
                                                                    "type": "text",
                                                                    "text": "素食",
                                                                    "size": "sm",
                                                                    "color": "#555555",
                                                                    "flex": 3
                                                                },
                                                                {
                                                                    "type": "text",
                                                                    "text": reservation.vegetarian,
                                                                    "size": "sm",
                                                                    "color": "#111111",
                                                                    "flex": 7,
                                                                    "wrap": true
                                                                }
                                                            ],
                                                            "margin": "md"
                                                        },
                                                        {
                                                            "type": "box",
                                                            "layout": "horizontal",
                                                            "contents": [
                                                                {
                                                                    "type": "text",
                                                                    "text": "特殊需求",
                                                                    "size": "sm",
                                                                    "color": "#555555",
                                                                    "flex": 3
                                                                },
                                                                {
                                                                    "type": "text",
                                                                    "text": reservation.specialNeeds,
                                                                    "size": "sm",
                                                                    "color": "#111111",
                                                                    "flex": 7,
                                                                    "wrap": true
                                                                }
                                                            ],
                                                            "margin": "md"
                                                        },
                                                        {
                                                            "type": "box",
                                                            "layout": "horizontal",
                                                            "contents": [
                                                                {
                                                                    "type": "text",
                                                                    "text": "備註",
                                                                    "size": "sm",
                                                                    "color": "#555555",
                                                                    "flex": 3
                                                                },
                                                                {
                                                                    "type": "text",
                                                                    "text": reservation.notes || '無',
                                                                    "size": "sm",
                                                                    "color": "#111111",
                                                                    "flex": 7,
                                                                    "wrap": true
                                                                }
                                                            ],
                                                            "margin": "md"
                                                        }
                                                    ]
                                                }
                                            ],
                                            "paddingAll": "20px"
                                        },
                                        "footer": {
                                            "type": "box",
                                            "layout": "vertical",
                                            "contents": [
                                                {
                                                    "type": "text",
                                                    "text": "感謝您的訂位！",
                                                    "align": "center",
                                                    "color": "#66BB6A",
                                                    "weight": "bold"
                                                }
                                            ],
                                            "paddingAll": "20px"
                                        }
                                    }
                                });
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

                            await sendLineMessage(lineUserId, '電話號碼綁定成功！未來訂位時輸入此電話號碼將會收到通知。');
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
                if (!phoneRegex.test(userMessage)) {
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
                        type: 'flex',
                        altText: '確認訂位資訊',
                        contents: {
                            "type": "bubble",
                            "header": {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {
                                        "type": "box",
                                        "layout": "horizontal",
                                        "contents": [
                                            {
                                                "type": "text",
                                                "text": "確認訂位資訊",
                                                "color": "#ffffff",
                                                "align": "center",
                                                "gravity": "center",
                                                "size": "lg",
                                                "flex": 4,
                                                "weight": "bold"
                                            }
                                        ],
                                        "alignItems": "center"
                                    }
                                ],
                                "backgroundColor": "#66BB6A",
                                "paddingAll": "20px"
                            },
                            "body": {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "請確認以下訂位資訊：",
                                        "weight": "bold",
                                        "size": "md",
                                        "wrap": true,
                                        "align": "center",
                                        "color": "#2E4A62"
                                    },
                                    {
                                        "type": "box",
                                        "layout": "vertical",
                                        "margin": "lg",
                                        "spacing": "sm",
                                        "contents": [
                                            {
                                                "type": "box",
                                                "layout": "horizontal",
                                                "contents": [
                                                    {
                                                        "type": "text",
                                                        "text": "姓名",
                                                        "size": "sm",
                                                        "color": "#555555",
                                                        "flex": 2
                                                    },
                                                    {
                                                        "type": "text",
                                                        "text": maskedName,  // 已經遮罩的姓名
                                                        "size": "sm",
                                                        "color": "#111111",
                                                        "flex": 5
                                                    }
                                                ]
                                            },
                                            {
                                                "type": "box",
                                                "layout": "horizontal",
                                                "contents": [
                                                    {
                                                        "type": "text",
                                                        "text": "電話",
                                                        "size": "sm",
                                                        "color": "#555555",
                                                        "flex": 2
                                                    },
                                                    {
                                                        "type": "text",
                                                        "text": maskedPhone,  // 已經遮罩的電話
                                                        "size": "sm",
                                                        "color": "#111111",
                                                        "flex": 5
                                                    }
                                                ],
                                                "margin": "md"
                                            },
                                            {
                                                "type": "box",
                                                "layout": "horizontal",
                                                "contents": [
                                                    {
                                                        "type": "text",
                                                        "text": "日期",
                                                        "size": "sm",
                                                        "color": "#555555",
                                                        "flex": 2
                                                    },
                                                    {
                                                        "type": "text",
                                                        "text": recentReservation.date,
                                                        "size": "sm",
                                                        "color": "#111111",
                                                        "flex": 5
                                                    }
                                                ],
                                                "margin": "md"
                                            },
                                            {
                                                "type": "box",
                                                "layout": "horizontal",
                                                "contents": [
                                                    {
                                                        "type": "text",
                                                        "text": "時間",
                                                        "size": "sm",
                                                        "color": "#555555",
                                                        "flex": 2
                                                    },
                                                    {
                                                        "type": "text",
                                                        "text": recentReservation.time,
                                                        "size": "sm",
                                                        "color": "#111111",
                                                        "flex": 5
                                                    }
                                                ],
                                                "margin": "md"
                                            }
                                        ]
                                    }
                                ],
                                "paddingAll": "20px"
                            },
                            "footer": {
                                "type": "box",
                                "layout": "horizontal",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "button",
                                        "style": "secondary",
                                        "height": "sm",
                                        "action": {
                                            "type": "postback",
                                            "label": "取消",
                                            "data": "action=cancel_binding"
                                        }
                                    },
                                    {
                                        "type": "button",
                                        "style": "primary",
                                        "height": "sm",
                                        "action": {
                                            "type": "postback",
                                            "label": "確認",
                                            "data": `action=confirm_recent_reservation&phone=${phone}`
                                        },
                                        "color": "#66BB6A"
                                    }
                                ],
                                "flex": 0,
                                "paddingAll": "20px"
                            }
                        }
                    });
                } else {
                    // 發送一般綁定確認
                    await sendLineMessage(lineUserId, {
                        type: 'flex',
                        altText: '確認綁定電話',
                        contents: {
                            "type": "bubble",
                            "header": {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {
                                        "type": "box",
                                        "layout": "horizontal",
                                        "contents": [
                                            {
                                                "type": "text",
                                                "text": "確認綁定電話",
                                                "color": "#ffffff",
                                                "align": "center",
                                                "gravity": "center",
                                                "size": "lg",
                                                "flex": 4,
                                                "weight": "bold"
                                            }
                                        ],
                                        "alignItems": "center"
                                    }
                                ],
                                "backgroundColor": "#66BB6A",
                                "paddingAll": "20px"
                            },
                            "body": {
                                "type": "box",
                                "layout": "vertical",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "確認要綁定此電話號碼嗎？",
                                        "weight": "bold",
                                        "size": "md",
                                        "wrap": true,
                                        "align": "center",
                                        "color": "#2E4A62"
                                    },
                                    {
                                        "type": "text",
                                        "text": phone,  
                                        "weight": "bold",
                                        "size": "xl",
                                        "wrap": true,
                                        "align": "center",
                                        "color": "#2E4A62",
                                        "margin": "md"
                                    }
                                ],
                                "paddingAll": "20px"
                            },
                            "footer": {
                                "type": "box",
                                "layout": "horizontal",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "button",
                                        "style": "secondary",
                                        "height": "sm",
                                        "action": {
                                            "type": "postback",
                                            "label": "取消",
                                            "data": "action=cancel_binding"
                                        }
                                    },
                                    {
                                        "type": "button",
                                        "style": "primary",
                                        "height": "sm",
                                        "action": {
                                            "type": "postback",
                                            "label": "確認",
                                            "data": `action=confirm_general_binding&phone=${phone}` 
                                        },
                                        "color": "#66BB6A"
                                    }
                                ],
                                "flex": 0,
                                "paddingAll": "20px"
                            }
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
        let reservationData = await redisClient.get(token);
        
        if (!reservationData) {
            const reservation = await Reservation.findOne({ reservationToken: token });
            if (!reservation) {
                console.error('No reservation found for token:', token);
                return res.redirect('/form?error=invalid_token');
            }
            reservationData = JSON.stringify(reservation);
        }

        const parsedData = JSON.parse(reservationData);
        
        const existingLineUser = await UserID.findOne({ phone: parsedData.phone });
        
        res.cookie('reservationToken', token, { 
            maxAge: 120000,
            httpOnly: true 
        });

        res.sendFile(path.join(__dirname, 'html', 'success.html'));

        setTimeout(async () => {
            await redisClient.del(token);
            console.log(`Token Deleted: ${token}, Time: ${new Date().toISOString()}`);
        }, 120000);

    } catch (error) {
        console.error('Error in success page:', error);
        res.redirect('/form?error=server_error');
    }
});

app.get('/api/reservation/:token', async (req, res) => {
    const token = req.params.token;
    try {
        let reservationData = await redisClient.get(token);
        
        if (!reservationData) {
            const reservation = await Reservation.findOne({ reservationToken: token });
            if (!reservation) {
                return res.status(404).json({ error: 'Reservation not found' });
            }
            reservationData = JSON.stringify(reservation);
        }

        res.json(JSON.parse(reservationData));
    } catch (error) {
        console.error('Error fetching reservation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Connected to database: ${mongoose.connection.name}`);
});
