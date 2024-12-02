const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const { createClient } = require('redis');
const RedisStore = require('connect-redis').default;
const cookieParser = require('cookie-parser');
const { connectToDatabase, Reservation, UserID, GLW, GLH, Settings, VIP } = require('./database');
const redisUrl = process.env.REDIS_URL;
const fs = require('fs');
const axios = require('axios');
const nodemailer = require('nodemailer');
const userStates = {};
const jwt = require('jsonwebtoken');
const CronJob = require('cron').CronJob;
const moment = require('moment-timezone');
const reservationSuccessTemplate = require('./line-templates/reservation-success.json');
const welcomeTemplate = require('./line-templates/welcome.json');
const bindingSuccessTemplate = require('./line-templates/binding-success.json');
const confirmReservationTemplate = require('./line-templates/confirm-reservation.json');
const confirmBindingTemplate = require('./line-templates/confirm-binding.json');
const reservationCancelTemplate = require('./line-templates/reservation-cancel.json');
const seatedNotificationTemplate = require('./line-templates/seated-notification.json');
const manualCancelNotificationTemplate = require('./line-templates/manual-cancel-notification.json');
const customerNotificationTemplate = require('./line-templates/customer-notification.json');


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

const authenticateToken = (req, res, next) => {
    const accessToken = req.cookies.accessToken;
    const ip = getClientIP(req);
    
    if (!accessToken) {
        // 確保清除過期的 cookie
        res.clearCookie('accessToken');
        
        // 嘗試使用 refresh token
        const refreshToken = req.cookies.refreshToken;
        if (refreshToken) {
            redisClient.get(`auth_refresh_${refreshToken}`).then(username => {
                if (username) {
                    const newAccessToken = jwt.sign(
                        { username }, 
                        process.env.JWT_SECRET, 
                        { expiresIn: '15m' }
                    );
                    
                    res.cookie('accessToken', newAccessToken, {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'strict',
                        maxAge: 15 * 60 * 1000
                    });
                    
                    req.user = { username };
                    logAuth('TOKEN_REFRESH', username, true, ip);
                    return next();
                }
                logAuth('SESSION_EXPIRED', 'unknown', false, ip);
                if (req.path.startsWith('/api/')) {
                    return res.status(401).json({ error: 'Unauthorized' });
                }
                res.redirect('/bsl');
            }).catch(() => {
                logAuth('SESSION_ERROR', 'unknown', false, ip);
                if (req.path.startsWith('/api/')) {
                    return res.status(401).json({ error: 'Unauthorized' });
                }
                res.redirect('/bsl');
            });
            return;
        }
        logAuth('NO_TOKEN', 'unknown', false, ip);
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/bsl');
    }

    jwt.verify(accessToken, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            // Token 過期時，確保清除 cookie
            res.clearCookie('accessToken');
            
            if (err.name === 'TokenExpiredError') {
                logAuth('TOKEN_EXPIRED', user?.username || 'unknown', false, ip);
            } else {
                logAuth('TOKEN_INVALID', 'unknown', false, ip);
            }
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            return res.redirect('/bsl');
        }
        req.user = user;
        next();
    });
};

function logAuth(action, username, success, ip) {
    const timestamp = new Date().toISOString();
    const logEntry = `[Auth Log] ${timestamp} | ${action} | User: ${username} | Success: ${success} | IP: ${ip}`;
    
    // 使用 console.log 而不是寫入文件
    console.log(logEntry);
}

function generateToken(length = 8) {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

async function generateUniqueBookingCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    let isUnique = false;
    
    while (!isUnique) {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        
        // 檢查代碼是否已存在
        const existingReservation = await Reservation.findOne({ bookingCode: code });
        if (!existingReservation) {
            isUnique = true;
        }
    }
    return code;
}

function getTimeSlot(time, date) {
    const hour = parseInt(time.split(':')[0]);
    const reservationDate = moment.tz(date, 'Asia/Taipei');
    const dayOfWeek = reservationDate.day();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    
    if (isWeekday) {
        if (hour === 11) return 'wm1';
        if (hour === 12) return 'wm2';
        if (hour === 13) return 'wm3';
        if (hour === 17) return 'wa1';
        if (hour === 18) return 'wa2';
        if (hour >= 19) return 'wa3';
    } else {
        if (hour === 11) return 'hm1';
        if (hour === 12) return 'hm2';
        if (hour === 13) return 'hm3';
        if (hour === 14) return 'hm4';
        if (hour === 17) return 'ha1';
        if (hour === 18) return 'ha2';
        if (hour >= 19) return 'ha3';
    }
}

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
app.get(['/bsl', '/backstage-login'], (req, res) => {
    const accessToken = req.cookies.accessToken;
    if (accessToken) {
        try {
            jwt.verify(accessToken, process.env.JWT_SECRET);
            return res.redirect('/bs');
        } catch (err) {
        }
    }
    res.sendFile(path.join(__dirname, 'html', 'backstage-login.html'));
});
app.get(['/bs', '/backstage'], authenticateToken, (req, res) => {
res.sendFile(path.join(__dirname, 'html', 'backstage.html'));
});

connectToDatabase();
redisClient.connect().catch(console.error);

const { invalidPhoneNumbers } = JSON.parse(fs.readFileSync('pnb.json', 'utf-8'));
const invalidNumbersPattern = invalidPhoneNumbers.join('|');
const phoneRegex = new RegExp(`^09(?!${invalidNumbersPattern})\\d{8}$`);
// const LINE_CLIENT_ID = process.env.LINE_CLIENT_ID;  
// const LINE_CLIENT_SECRET = process.env.LINE_CLIENT_SECRET;  
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
// const REDIRECT_URI = 'https://zhima-youzi.onrender.com/line/line_callback'; 


// const Reservation = mongoose.model('Reservation', reservationSchema, 'bookings');

async function cleanExpiredData() {
    const today = moment.tz('Asia/Taipei').startOf('day');
    
    try {
        await GLW.deleteMany({ date: { $lt: today.format('YYYY-MM-DD') } });
        await GLH.deleteMany({ date: { $lt: today.format('YYYY-MM-DD') } });
    } catch (error) {
        console.error('Error cleaning expired data:', error);
    }
}

const cleanupSchedule = new CronJob('0 0 * * *', cleanExpiredData, null, true, 'Asia/Taipei');
cleanupSchedule.start();

async function sendEmail(toEmail, reservationData) {
    const {
        name,
        date,
        time,
        adults,
        children,
        vegetarian,
        specialNeeds,
        notes,
        bookingCode
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
                    <p style="margin: 5px 0;">訂位代碼：${bookingCode}</p>
                </div>

                <p style="color: #666;">如需修改訂位，請提前來電告知。</p>
                <p style="color: #666;">期待您的光臨！</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                    <p style="color: #999; font-size: 14px;">芝麻柚子 とんかつ</p>
                    <p style="color: #999; font-size: 14px;">電：03 558 7360</p>
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

app.get('/api/time-slots', async (req, res) => {
    try {
        const date = req.query.date;
        const queryDate = moment.tz(date, 'Asia/Taipei');
        const dayOfWeek = queryDate.day();
        const settings = await Settings.findOne() || {
            wm: 2, wa: 2, hm: 3, ha: 3
        };

        const today = moment.tz('Asia/Taipei').startOf('day');
        if (queryDate.isBefore(today)) {
            return res.status(400).json({ error: '不能選擇過去的日期' });
        }

        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            let glwData = await GLW.findOne({ date });
            if (!glwData) {
                glwData = new GLW({
                    date,
                    wm1: 0, wm2: 0, wm3: 0,
                    wa1: 0, wa2: 0, wa3: 0
                });
                await glwData.save();
            }
            return res.json({
                ...glwData.toObject(),
                settings: {
                    wm: settings.wm,
                    wa: settings.wa
                }
            });
        } else {
            let glhData = await GLH.findOne({ date });
            if (!glhData) {
                glhData = new GLH({
                    date,
                    hm1: 0, hm2: 0, hm3: 0, hm4: 0,
                    ha1: 0, ha2: 0, ha3: 0
                });
                await glhData.save();
            }
            return res.json({
                ...glhData.toObject(),
                settings: {
                    hm: settings.hm,
                    ha: settings.ha
                }
            });
        }
    } catch (error) {
        console.error('Error fetching time slots:', error);
        res.status(500).json({ error: '獲取時段資訊失敗' });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const settings = await Settings.findOne({});
        if (!settings) {
            // 如果沒有設置，返回默認值
            return res.json({
                wm: 2,
                wa: 2,
                hm: 3,
                ha: 3,
                upt: '-'
            });
        }
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const { wm, wa, hm, ha, upt } = req.body;
        
        // 更新或創建設置
        const settings = await Settings.findOneAndUpdate(
            {}, // 空條件表示更新第一個文檔
            { wm, wa, hm, ha, upt },
            { upsert: true, new: true } // 如果不存在則創建，返回更新後的文檔
        );
        
        res.json(settings);
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/bookings', async (req, res) => {
    try {
        const date = req.query.date;
        const bookings = await Reservation.find({ date: date })
                                        .sort({ time: 1 }); 
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: '載入訂位失敗' });
    }
});

app.post('/reservations', async (req, res) => {
    try {
        console.log('Received reservation request:', req.body);
        
        const { 
            name, phone, email, gender, date, time, 
            adults, children, vegetarian, specialNeeds, notes 
        } = req.body;

        if (!time || time.trim() === '') {
            return res.status(400).json({ error: '請選擇用餐時間' });
        }
        
        const token = generateToken();
        const bookingCode = await generateUniqueBookingCode();
        
        // 轉換為台灣時間
        const reservationDate = moment.tz(date, 'Asia/Taipei');
        const dayOfWeek = reservationDate.day();
        const timeSlot = getTimeSlot(time, date);
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

        // 獲取設置
        const settings = await Settings.findOne() || {
            wm: 2, wa: 2, hm: 3, ha: 3
        };

        // 檢查日期是否存在於資料庫
        if (isWeekday) {
            const glwData = await GLW.findOne({ date });
            
            if (!glwData) {
                // 如果不在資料庫中 - 創建新記錄
                const newGLW = new GLW({
                    date,
                    wm1: 0, wm2: 0, wm3: 0,
                    wa1: 0, wa2: 0, wa3: 0
                });
                // 更新選擇的時段
                newGLW[timeSlot] = 1;
                await newGLW.save();

                // 創建預約
                const reservation = new Reservation({
                    name,
                    phone,
                    email,
                    gender,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode
                });
                await reservation.save();

                // 存入 Redis
                await redisClient.set(token, JSON.stringify({
                    name,
                    phone,
                    email,
                    gender,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode,
                    createdAt: new Date().toISOString()
                }), 'EX', 120);

                // 發送確認郵件
                await sendEmail(email, {
                    name,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode
                });

                // LINE 通知
                const existingLineUser = await UserID.findOne({ phone });
                if (existingLineUser) {
                    const messageTemplate = JSON.parse(JSON.stringify(reservationSuccessTemplate));
                    messageTemplate.body.contents[0].text = `${existingLineUser.lineName}，您好！`;
                    const reservationInfo = messageTemplate.body.contents[1].contents;
                    
                    reservationInfo.forEach(box => {
                        const label = box.contents[0].text;
                        switch(label) {
                            case "姓名":
                                box.contents[1].text = name;
                                break;
                            case "日期":
                                box.contents[1].text = date;
                                break;
                            case "時間":
                                box.contents[1].text = time;
                                break;
                            case "人數":
                                box.contents[1].text = `${adults}大${children}小`;
                                break;
                            case "素食":
                                box.contents[1].text = vegetarian;
                                break;
                            case "特殊需求":
                                box.contents[1].text = specialNeeds;
                                break;
                            case "備註":
                                box.contents[1].text = notes || '無';
                                break;
                            case "訂位代碼":
                                box.contents[1].text = bookingCode;
                                break; 
                        }
                    });

                    await sendLineMessage(existingLineUser.lineUserId, {
                        type: 'flex',
                        altText: '訂位成功通知',
                        contents: messageTemplate
                    });
                }

                // 跳轉到成功頁面
                return res.redirect(`/${token}/success`);

            } else {
                // 如果在資料庫中 - 檢查限制
                const limit = timeSlot.startsWith('wm') ? settings.wm : settings.wa;
                
                // 檢查是否達到限制
                if (glwData[timeSlot] >= limit) {
                    return res.status(400).json({ 
                        error: '該時段已滿，請重新選擇時段'
                    });
                }
                
                // 未達到限制 - 更新時段計數
                await GLW.updateOne(
                    { date },
                    { $inc: { [timeSlot]: 1 } }
                );

                // 創建預約
                const reservation = new Reservation({
                    name,
                    phone,
                    email,
                    gender,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode
                });
                await reservation.save();

                // 存入 Redis
                await redisClient.set(token, JSON.stringify({
                    name,
                    phone,
                    email,
                    gender,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode,
                    createdAt: new Date().toISOString()
                }), 'EX', 120);

                // 發送確認郵件
                await sendEmail(email, {
                    name,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode
                });

                // LINE 通知
                const existingLineUser = await UserID.findOne({ phone });
                if (existingLineUser) {
                    const messageTemplate = JSON.parse(JSON.stringify(reservationSuccessTemplate));
                    messageTemplate.body.contents[0].text = `${existingLineUser.lineName}，您好！`;
                    const reservationInfo = messageTemplate.body.contents[1].contents;
                    
                    reservationInfo.forEach(box => {
                        const label = box.contents[0].text;
                        switch(label) {
                            case "姓名":
                                box.contents[1].text = name;
                                break;
                            case "日期":
                                box.contents[1].text = date;
                                break;
                            case "時間":
                                box.contents[1].text = time;
                                break;
                            case "人數":
                                box.contents[1].text = `${adults}大${children}小`;
                                break;
                            case "素食":
                                box.contents[1].text = vegetarian;
                                break;
                            case "特殊需求":
                                box.contents[1].text = specialNeeds;
                                break;
                            case "備註":
                                box.contents[1].text = notes || '無';
                                break;
                            case "訂位代碼":
                                box.contents[1].text = bookingCode;
                                break;
                        }
                    });

                    await sendLineMessage(existingLineUser.lineUserId, {
                        type: 'flex',
                        altText: '訂位成功通知',
                        contents: messageTemplate
                    });
                }

                // 跳轉到成功頁面
                return res.redirect(`/${token}/success`);
            }
        } else {
            const glhData = await GLH.findOne({ date });
            
            if (!glhData) {
                // 如果不在資料庫中 - 創建新記錄
                const newGLH = new GLH({
                    date,
                    hm1: 0, hm2: 0, hm3: 0, hm4: 0,
                    ha1: 0, ha2: 0, ha3: 0
                });
                // 更新選擇的時段
                newGLH[timeSlot] = 1;
                await newGLH.save();

                // 創建預約
                const reservation = new Reservation({
                    name,
                    phone,
                    email,
                    gender,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode
                });
                await reservation.save();

                // 存入 Redis
                await redisClient.set(token, JSON.stringify({
                    name,
                    phone,
                    email,
                    gender,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode,
                    createdAt: new Date().toISOString()
                }), 'EX', 120);

                // 發送確認郵件
                await sendEmail(email, {
                    name,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode
                }); 

                // LINE 通知
                const existingLineUser = await UserID.findOne({ phone });
                if (existingLineUser) {
                    const messageTemplate = JSON.parse(JSON.stringify(reservationSuccessTemplate));
                    messageTemplate.body.contents[0].text = `${existingLineUser.lineName}，您好！`;
                    const reservationInfo = messageTemplate.body.contents[1].contents;
                    
                    reservationInfo.forEach(box => {
                        const label = box.contents[0].text;
                        switch(label) {
                            case "姓名":
                                box.contents[1].text = name;
                                break;
                            case "日期":
                                box.contents[1].text = date;
                                break;
                            case "時間":
                                box.contents[1].text = time;
                                break;
                            case "人數":
                                box.contents[1].text = `${adults}大${children}小`;
                                break;
                            case "素食":
                                box.contents[1].text = vegetarian;
                                break;
                            case "特殊需求":
                                box.contents[1].text = specialNeeds;
                                break;
                            case "備註":
                                box.contents[1].text = notes || '無';
                                break;
                            case "訂位代碼":
                                box.contents[1].text = bookingCode;
                                break;
                        }
                    });

                    await sendLineMessage(existingLineUser.lineUserId, {
                        type: 'flex',
                        altText: '訂位成功通知',
                        contents: messageTemplate
                    });
                }

                // 跳轉到成功頁面
                return res.redirect(`/${token}/success`);

            } else {
                // 如果在資料庫中 - 檢查限制
                const limit = timeSlot.startsWith('hm') ? settings.hm : settings.ha;
                
                // 檢查是否達到限制
                if (glhData[timeSlot] >= limit) {
                    return res.status(400).json({ 
                        error: '該時段已滿，請重新選擇時段'
                    });
                }
                
                // 未達到限制 - 更新時段計數
                await GLH.updateOne(
                    { date },
                    { $inc: { [timeSlot]: 1 } }
                );

                // 創建預約
                const reservation = new Reservation({
                    name,
                    phone,
                    email,
                    gender,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode
                });
                await reservation.save();

                // 存入 Redis
                await redisClient.set(token, JSON.stringify({
                    name,
                    phone,
                    email,
                    gender,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode,    
                    createdAt: new Date().toISOString()
                }), 'EX', 120);

                // 發送確認郵件
                await sendEmail(email, {
                    name,
                    date,
                    time,
                    adults,
                    children,
                    vegetarian,
                    specialNeeds,
                    notes,
                    bookingCode
                });

                // LINE 通知
                const existingLineUser = await UserID.findOne({ phone });
                if (existingLineUser) {
                    const messageTemplate = JSON.parse(JSON.stringify(reservationSuccessTemplate));
                    messageTemplate.body.contents[0].text = `${existingLineUser.lineName}，您好！`;
                    const reservationInfo = messageTemplate.body.contents[1].contents;
                    
                    reservationInfo.forEach(box => {
                        const label = box.contents[0].text;
                        switch(label) {
                            case "姓名":
                                box.contents[1].text = name;
                                break;
                            case "日期":
                                box.contents[1].text = date;
                                break;
                            case "時間":
                                box.contents[1].text = time;
                                break;
                            case "人數":
                                box.contents[1].text = `${adults}大${children}小`;
                                break;
                            case "素食":
                                box.contents[1].text = vegetarian;
                                break;
                            case "特殊需求":
                                box.contents[1].text = specialNeeds;
                                break;
                            case "備註":
                                box.contents[1].text = notes || '無';
                                break;
                            case "訂位代碼":
                                box.contents[1].text = bookingCode;
                                break;
                        }
                    });

                    await sendLineMessage(existingLineUser.lineUserId, {
                        type: 'flex',
                        altText: '訂位成功通知',
                        contents: messageTemplate
                    });
                }

                // 跳轉到成功頁面
                return res.redirect(`/${token}/success`);
            }
        }

    } catch (error) {
        console.error('Reservation error:', error);
        res.status(500).json({ error: '預約失敗' });
    }
});

app.post('/line/webhook', async (req, res) => {
    console.log('Received webhook:', JSON.stringify(req.body, null, 2));
    
    try {
        const events = req.body.events;
        for (const event of events) {
            const lineUserId = event.source.userId;
            
            // 檢查用戶是否已綁定 (移到最外層)
            const existingUser = await UserID.findOne({ lineUserId });

            // 1. 處理加入好友事件
            if (event.type === 'follow') {
                const userProfile = await axios.get(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
                    headers: {
                        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
                    }
                });
                const lineName = userProfile.data.displayName;
                
                if (!existingUser) {
                    await sendLineMessage(lineUserId, {
                        type: 'flex',
                        altText: '歡迎加入芝麻柚子 とんかつ官方帳號',
                        contents: welcomeTemplate
                    });
                }
            }

            // 只處理未綁定用戶的消息
            if (!existingUser) {
                // 2. 處理按鈕回應
                if (event.type === 'postback') {
                    const data = new URLSearchParams(event.postback.data);
                    const action = data.get('action');
                    const phone = data.get('phone');

                    switch (action) {
                        case 'bind_phone':
                            userStates[lineUserId] = 'WAITING_FOR_PHONE';
                            await sendLineMessage(lineUserId, {
                                type: 'text',
                                text: '請輸入您的手機號碼（例：0912345678）'
                            });
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
                                    const messageTemplate = JSON.parse(JSON.stringify(bindingSuccessTemplate));
                                    const reservationInfo = messageTemplate.body.contents[1].contents;
                                    
                                    // 更新所有預訂資訊
                                    reservationInfo.forEach(box => {
                                        const label = box.contents[0].text;
                                        switch(label) {
                                            case "姓名":
                                                box.contents[1].text = reservation.name;
                                                break;
                                            case "電話":
                                                box.contents[1].text = reservation.phone;
                                                break;
                                            case "日期":
                                                box.contents[1].text = reservation.date;
                                                break;
                                            case "時間":
                                                box.contents[1].text = reservation.time;
                                                break;
                                            case "人數":
                                                box.contents[1].text = `${reservation.adults}大${reservation.children}小`;
                                                break;
                                            case "素食":
                                                box.contents[1].text = reservation.vegetarian;
                                                break;
                                            case "特殊需求":
                                                box.contents[1].text = reservation.specialNeeds;
                                                break;
                                            case "備註":
                                                box.contents[1].text = reservation.notes || '無';
                                                break;
                                            case "訂位代碼":
                                                box.contents[1].text = reservation.bookingCode;
                                                break;  
                                        }
                                    });

                                    await sendLineMessage(lineUserId, {
                                        type: 'flex',
                                        altText: '電話號碼綁定成功',
                                        contents: messageTemplate
                                    });
                                }
                            } catch (error) {
                                console.error('Error in confirm_recent_reservation:', error);
                                await sendLineMessage(lineUserId, {
                                    type: 'text',
                                    text: '綁定過程發生錯誤，請稍後再試。'
                                });
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

                                await sendLineMessage(lineUserId, {
                                    type: 'text',
                                    text: '電話號碼綁定成功！未來訂位時輸入此電話號碼將會收到通知。'
                                });
                            } catch (error) {
                                console.error('Error in confirm_general_binding:', error);
                                await sendLineMessage(lineUserId, {
                                    type: 'text',
                                    text: '綁定過程發生錯誤，請稍後再試。'
                                });
                            }
                            break;

                        case 'cancel_binding':
                            delete userStates[lineUserId];
                            await sendLineMessage(lineUserId, {
                                type: 'text',
                                text: '已取消綁定。'
                            });
                            break;
                    }
                }

                // 3. 處理電話號碼輸入
                if (event.type === 'message' && event.message.type === 'text') {
                    const userMessage = event.message.text;
                    
                    // 驗證電話號碼格式
                    if (userStates[lineUserId] === 'WAITING_FOR_PHONE') { 
                        const phoneRegex = /^09\d{8}$/;
                        if (!phoneRegex.test(userMessage)) {
                            await sendLineMessage(lineUserId, {
                                type: 'text',
                                text: '請輸入有效的手機號碼（例：0912345678）'
                            });
                            return;
                        }

                        // 檢查是否已經綁定
                        const existingBinding = await UserID.findOne({ phone: userMessage });
                        if (existingBinding) {
                            await sendLineMessage(lineUserId, {
                                type: 'text',
                                text: '此電話號碼已經被綁定。'
                            });
                            return;
                        }

                        // 查詢2分鐘內的新訂位
                        const recentReservation = await Reservation.findOne({
                            phone: userMessage,
                            createdAt: { 
                                $gte: new Date(Date.now() - 120000)
                            }
                        }).sort({ createdAt: -1 });

                        if (recentReservation) {
                            // 發送遮罩後的訂位資訊確認
                            const messageTemplate = JSON.parse(JSON.stringify(confirmReservationTemplate));

                            const maskedName = recentReservation.name.charAt(0) + '*'.repeat(recentReservation.name.length - 1);
                            const maskedPhone = `${userMessage.slice(0, 4)}**${userMessage.slice(-2)}`;
                            
                            // 遞迴函數來處理巢狀結構
                            const updateTemplateValues = (contents) => {
                                if (Array.isArray(contents)) {
                                    contents.forEach(content => updateTemplateValues(content));
                                } else if (contents && typeof contents === 'object') {
                                    // 處理當前物件的 text 屬性
                                    if (contents.text) {
                                        switch (contents.text) {
                                            case '${maskedName}':
                                                contents.text = maskedName;
                                                break;
                                            case '${maskedPhone}':
                                                contents.text = maskedPhone;
                                                break;
                                            case '${date}':
                                                const dayMapping = ['日', '一', '二', '三', '四', '五', '六'];
                                                const weekDay = dayMapping[new Date(recentReservation.date).getDay()];
                                                contents.text = `${moment(recentReservation.date).format('YYYY/MM/DD')} (${weekDay})`;
                                                break;
                                            case '${time}':
                                                contents.text = recentReservation.time;
                                                break;
                                        }
                                    }
                                    // 遞迴處理所有子屬性
                                    Object.values(contents).forEach(value => {
                                        if (typeof value === 'object') {
                                            updateTemplateValues(value);
                                        }
                                    });
                                }
                            };

                            // 更新整個模板
                            updateTemplateValues(messageTemplate);

                            // 更新確認按鈕的 data
                            messageTemplate.footer.contents[1].action.data = 
                                `action=confirm_recent_reservation&phone=${userMessage}`;

                            await sendLineMessage(lineUserId, {
                                type: 'flex',
                                altText: '確認訂位資訊',
                                contents: messageTemplate
                            });
                        } else {
                            // 發送一般綁定確認
                            const messageTemplate = JSON.parse(JSON.stringify(confirmBindingTemplate));
                            // 更新電話號碼
                            messageTemplate.body.contents[1].text = userMessage;
                            // 更新確認按鈕的 data
                            messageTemplate.footer.contents[1].action.data = `action=confirm_general_binding&phone=${userMessage}`;

                            await sendLineMessage(lineUserId, {
                                type: 'flex',
                                altText: '確認綁定電話',
                                contents: messageTemplate
                            });
                        }
                        
                        // 清除用戶狀態
                        delete userStates[lineUserId];
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

// 在發送 LINE 訊息前檢查並更新用戶資料
async function sendLineMessage(userId, message) {
    try {
        // 先獲取用戶的 LINE 個人資料
        const userProfile = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
            headers: {
                'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
            }
        });
        
        // 查找現有用戶資料
        const existingUser = await UserID.findOne({ lineUserId: userId });
        
        // 如果名稱有變更才更新
        if (existingUser && existingUser.lineName !== userProfile.data.displayName) {
            console.log(`Updating LINE name for user ${userId} from "${existingUser.lineName}" to "${userProfile.data.displayName}"`);
            
            await UserID.findOneAndUpdate(
                { lineUserId: userId },
                { lineName: userProfile.data.displayName },
                { new: true }
            );
        }

        // 處理 Flex Message
        let messages;
        if (typeof message === 'string') {
            messages = [{ type: 'text', text: message }];
        } else if (Array.isArray(message)) {
            messages = message;
        } else if (message.type === 'flex') {
            // 移除 color 屬性
            if (message.contents?.footer?.contents) {
                message.contents.footer.contents.forEach(content => {
                    if (content.action?.color) {
                        delete content.action.color;
                    }
                });
            }
            messages = [message];
        } else {
            messages = [message];
        }

        // 發送訊息
        const response = await axios.post('https://api.line.me/v2/bot/message/push', {
            to: userId,
            messages: messages
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
            }
        });
        return response.data;
    } catch (error) {
        console.error('LINE API Error:', error.response?.data || error);
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
                return res.redirect('/form');
            }
            reservationData = JSON.stringify(reservation);
        }

        const parsedData = JSON.parse(reservationData);
        
        const existingLineUser = await UserID.findOne({ phone: parsedData.phone });
        
        res.cookie('reservationToken', token, { 
            maxAge: 120000,
            httpOnly: true 
        });

        const successPath = path.join(__dirname, 'html', 'success.html');
        console.log('Success page path:', successPath);

        if (fs.existsSync(successPath)) {
            res.sendFile(successPath);
        } else {
            console.error('Success page not found at:', successPath);
            res.status(404).send('Success page not found');
        }

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

// IP 地址處理函數
function getClientIP(req) {
    // 獲取真實 IP 地址（如果有代理的話）
    const realIP = req.headers['x-real-ip'] || 
                  req.headers['x-forwarded-for'] || 
                  req.ip || 
                  req.connection.remoteAddress;
    
    // 處理 IPv6 格式
    if (realIP === '::1') {
        return 'localhost';
    }
    
    // 如果是 IPv6 格式但包含 IPv4
    if (realIP.includes('::ffff:')) {
        return realIP.replace('::ffff:', '');
    }
    
    return realIP;
}

// 修改入 API
app.post('/api/login', async (req, res) => {
    const { username, password, rememberMe } = req.body;
    const ip = getClientIP(req);
    
    const success = username === process.env.ADMIN_USERNAME && 
                   password === process.env.ADMIN_PASSWORD;
    
    logAuth('LOGIN', username, success, ip);
    
    if (success) {
        // 生成 access token
        const accessToken = jwt.sign(
            { username }, 
            process.env.JWT_SECRET, 
            { expiresIn: '15m' }
        );
        
        // 設置 access token cookie
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });

        if (rememberMe) {
            // 生成 refresh token
            const refreshToken = crypto.randomBytes(64).toString('hex');
            
            // 存儲 refresh token 到 Redis
            await redisClient.set(
                `auth_refresh_${refreshToken}`,
                username,
                'EX',
                30 * 24 * 60 * 60  // 30天
            );
            
            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 24 * 60 * 60 * 1000  // 30天
            });
        }

        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// 修改登出 API
app.post('/api/logout', async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    const accessToken = req.cookies.accessToken;
    const ip = getClientIP(req);
    
    let username = 'unknown';
    
    if (accessToken) {
        try {
            const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
            username = decoded.username;
        } catch (err) {
            console.error('Error decoding token during logout:', err);
        }
    }
    
    logAuth('LOGOUT', username, true, ip);
    
    if (refreshToken) {
        try {
            await redisClient.del(`auth_refresh_${refreshToken}`);
        } catch (err) {
            console.error('Error deleting refresh token:', err);
        }
    }
    
    // 確保完全清除 cookie
    res.clearCookie('accessToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    
    res.json({ success: true });
});

// 添加 check-auth 路由
app.get('/api/check-auth', authenticateToken, (req, res) => {
    res.json({ success: true });
});

app.get('/api/vip/phones', async (req, res) => {
    try {
        const vips = await VIP.find({}, 'phone');
        const phones = vips.map(vip => vip.phone);
        res.json(phones);
    } catch (error) {
        console.error('Error fetching VIP phones:', error);
        res.status(500).json({ message: '獲取常客列表失敗' });
    }
});

// 獲取分頁常客列表
app.get('/api/vip/list', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const vips = await VIP.find()
            .sort({ createdAt: -1 })  // 按加入時間降序排序
            .skip(skip)
            .limit(limit);

        const total = await VIP.countDocuments();
        const hasNextPage = skip + vips.length < total;

        res.json({
            vips,
            hasNextPage,
            currentPage: page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching VIP list:', error);
        res.status(500).json({ message: '獲取常客列表失敗' });
    }
});

app.post('/api/vip/add', async (req, res) => {
    try {
        const { name, phone } = req.body;
        
        // 檢查是否已經是常客
        const existingVIP = await VIP.findOne({ phone });
        if (existingVIP) {
            // 檢查新名字是否與現有名字不同
            if (!existingVIP.name.includes(name)) {
                // 更新名字，將新名字加入到現有名字後面
                const updatedName = `${existingVIP.name},${name}`;
                await VIP.findByIdAndUpdate(existingVIP._id, { name: updatedName });
                return res.json({ message: '已更新常客名稱' });
            }
            return res.status(400).json({ message: '該客人已經在常客名單中' });
        }

        // 檢查是否有訂位紀錄
        const hasBooking = await Reservation.findOne({ phone });
        if (!hasBooking) {
            return res.status(400).json({ message: '查無此客人的訂位紀錄' });
        }

        // 新增常客
        const vip = new VIP({ name, phone });
        await vip.save();
        res.json({ message: '成功加入常客名單' });
    } catch (error) {
        console.error('Error adding/updating VIP:', error);
        res.status(500).json({ message: '新增/更新常客失敗' });
    }
});

app.post('/api/reservations/search-by-code', async (req, res) => {
    try {
        const { bookingCode } = req.body;
        const today = moment.tz('Asia/Taipei').startOf('day').format('YYYY-MM-DD');
        const reservation = await Reservation.findOne({ 
            bookingCode,
            date: { $gte: today },
            canceled: { $ne: true }
        });
        
        if (!reservation) {
            return res.status(404).json({ error: '找不到訂位資料' });
        }
        
        res.json({
            name: reservation.name,
            phone: reservation.phone,
            email: reservation.email,
            date: reservation.date,
            time: reservation.time,
            adults: reservation.adults,
            children: reservation.children,
            bookingCode: reservation.bookingCode
        });
    } catch (error) {
        res.status(500).json({ error: '查詢失敗' });
    }
});

// 使用姓名和電話查詢
app.post('/api/reservations/search-by-info', async (req, res) => {
    try {
        const { name, phone } = req.body;
        const today = moment.tz('Asia/Taipei').startOf('day').format('YYYY-MM-DD');
        const reservations = await Reservation.find({ 
            name,
            phone,
            date: { $gte: today },
            canceled: { $ne: true }
        });
        
        if (!reservations.length) {
            return res.status(404).json({ error: '找不到訂位資料' });
        }
        
        res.json(reservations.map(r => ({
            id: r._id,
            name: r.name,
            phone: r.phone,
            email: r.email,
            date: r.date,
            time: r.time,
            adults: r.adults,
            children: r.children,
            bookingCode: r.bookingCode
        })));
    } catch (error) {
        res.status(500).json({ error: '查詢失敗' });
    }
});

// 取消訂位
app.post('/api/reservations/cancel', async (req, res) => {
    try {
        const { bookingCode } = req.body;
        console.log('Received cancel request for booking:', bookingCode); // 添加日誌

        if (!bookingCode) {
            return res.status(400).json({ error: '訂位代碼不能為空' });
        }

        // 先查找訂位
        const reservation = await Reservation.findOne({ 
            bookingCode,
            canceled: { $ne: true }
        });

        if (!reservation) {
            return res.status(404).json({ error: '找不到訂位資料或訂位已被取消' });
        }

        console.log('Found reservation:', reservation); // 添加日誌

        // 更新訂位狀態
        reservation.canceled = true;
        reservation.canceledAt = new Date();
        await reservation.save();

        // 更新時段計數
        const date = reservation.date;
        const time = reservation.time;
        const hour = parseInt(time.split(':')[0]);
        const dayOfWeek = new Date(date).getDay();
        
        // 確定是平日還是假日
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const Model = isWeekday ? GLW : GLH;
        
        // 確定時段代碼
        let timeSlot;
        if (isWeekday) {
            if (hour === 11) timeSlot = 'wm1';
            else if (hour === 12) timeSlot = 'wm2';
            else if (hour === 13) timeSlot = 'wm3';
            else if (hour === 17) timeSlot = 'wa1';
            else if (hour === 18) timeSlot = 'wa2';
            else if (hour >= 19) timeSlot = 'wa3';
        } else {
            if (hour === 11) timeSlot = 'hm1';
            else if (hour === 12) timeSlot = 'hm2';
            else if (hour === 13) timeSlot = 'hm3';
            else if (hour === 14) timeSlot = 'hm4';
            else if (hour === 17) timeSlot = 'ha1';
            else if (hour === 18) timeSlot = 'ha2';
            else if (hour >= 19) timeSlot = 'ha3';
        }

        console.log('Updating time slot:', { date, timeSlot, isWeekday }); // 添加日誌

        // 更新時段資料
        const updateResult = await Model.updateOne(
            { date },
            { $inc: { [timeSlot]: -1 } }
        );
        console.log('Time slot update result:', updateResult); // 添加日誌

        // 取得星期幾的字串
        const displayDate = reservation.date;

        const dayMapping = ['日', '一', '二', '三', '四', '五', '六'];
        const weekDay = dayMapping[dayOfWeek];

        // 發送取消確認郵件給客人
        await sendCancelEmail(reservation.email, {
            name: reservation.name,
            date: displayDate,
            dayOfWeek: weekDay, 
            time: reservation.time,
            adults: reservation.adults,
            children: reservation.children,
            bookingCode: reservation.bookingCode
        });

        // 發送通知給餐廳
        await sendCancelNotificationEmail(process.env.EMAIL_USER, {
            name: reservation.name,
            date: displayDate,
            dayOfWeek: weekDay,         
            time: reservation.time,
            adults: reservation.adults,
            children: reservation.children,
            bookingCode: reservation.bookingCode
        });

        // 如果有 LINE 帳號綁定，發送 LINE 通知
        const lineUser = await UserID.findOne({ phone: reservation.phone });
        if (lineUser) {
            const messageTemplate = JSON.parse(JSON.stringify(reservationCancelTemplate));
            messageTemplate.body.contents[0].text = `${reservation.name}，您好！`;
            const reservationInfo = messageTemplate.body.contents[1].contents;
            
            reservationInfo.forEach(box => {
                const label = box.contents[0].text;
                switch(label) {
                    case "日期":
                        box.contents[1].text = `${reservation.date} (${weekDay})`;
                        break;
                    case "時間":
                        box.contents[1].text = reservation.time;
                        break;
                }
            });

            await sendLineMessage(lineUser.lineUserId, {
                type: 'flex',
                altText: '訂位取消通知',
                contents: messageTemplate
            });
        }

        res.json({ message: '訂位已成功取消' });
    } catch (error) {
        console.error('Cancel reservation error:', error);
        res.status(500).json({ error: '取消失敗' });
    }
});

// 新增取消訂位郵件函數
async function sendCancelEmail(email, data) {
    const emailData = {
        to: email,
        subject: '芝麻柚子 とんかつ | 訂位取消確認',
        html: `
            <div style="font-family: 'Microsoft JhengHei', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333;">訂位取消確認</h2>
                <p style="color: #666;">${data.name} 您好，</p>
                <p style="color: #666;">您已成功取消以下訂位：</p>
                
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>訂位資訊：</strong></p>
                    <p style="margin: 5px 0;">姓名：${data.name}</p>
                    <p style="margin: 5px 0;">日期：${data.date} (${data.dayOfWeek})</p>
                    <p style="margin: 5px 0;">時間：${data.time}</p>
                    <p style="margin: 5px 0;">人數：${data.adults}大${data.children}小</p>
                    <p style="margin: 5px 0;">訂位代碼：${data.bookingCode}</p>
                </div>

                <p style="color: #666;">如有任何問題，請隨時與我們聯繫。</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                    <p style="color: #999; font-size: 14px;">芝麻柚子 とんかつ</p>
                    <p style="color: #999; font-size: 14px;">電：03 558 7360</p>
                    <p style="color: #999; font-size: 14px;">地址：新竹縣竹北市光明一路490號</p>
                </div>
            </div>
        `
    };

    return await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html
    });
}

// 新增餐廳通知郵件函數
async function sendCancelNotificationEmail(email, data) {
    const emailData = {
        to: email,
        subject: '訂位取消通知',
        html: `
            <div style="font-family: 'Microsoft JhengHei', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333;">訂位取消通知</h2>
                <p style="color: #666;">有客人取消了訂位：</p>
                
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>訂位資訊：</strong></p>
                    <p style="margin: 5px 0;">姓名：${data.name}</p>
                    <p style="margin: 5px 0;">日期：${data.date} (${data.dayOfWeek})</p>
                    <p style="margin: 5px 0;">時間：${data.time}</p>
                    <p style="margin: 5px 0;">人數：${data.adults}大${data.children}小</p>
                    <p style="margin: 5px 0;">訂位代碼：${data.bookingCode}</p>
                </div>
            </div>
        `
    };

    return await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html
    });
}

// 處理入座狀態更新
app.post('/api/bookings/:id/seat', async (req, res) => {
    try {
        const bookingId = req.params.id;
        
        // 更新訂位狀態為已入座
        const updatedBooking = await Reservation.findByIdAndUpdate(
            bookingId,
            { seated: true },
            { new: true }
        );

        if (!updatedBooking) {
            return res.status(404).json({ message: '找不到訂位記錄' });
        }

        // 發送入座通知 email
        if (updatedBooking.email) {
            const dayMapping = ['日', '一', '二', '三', '四', '五', '六'];
            const weekDay = dayMapping[new Date(updatedBooking.date).getDay()];
            
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: updatedBooking.email,
                subject: '芝麻柚子 とんかつ | 入座通知',
                html: `
                    <div style="font-family: 'Microsoft JhengHei', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #333;">入座通知</h2>
                        <p style="color: #666;">${updatedBooking.name} 您好，</p>
                        
                        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 5px 0;">入座時間：${new Date().toLocaleTimeString('zh-TW', {
                                hour: '2-digit',
                                minute: '2-digit'
                            })}</p>
                        </div>

                        <p style="color: #666;">祝您用餐愉快！</p>
                        
                        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 14px;">芝麻柚子 とんかつ</p>
                            <p style="color: #999; font-size: 14px;">電話：03 558 7360</p>
                            <p style="color: #999; font-size: 14px;">地址：新竹縣竹北市光明一路490號</p>
                        </div>
                    </div>
                `
            });
        }

        // 檢查是否有綁定 LINE 帳號並發送通知
        const lineUser = await UserID.findOne({ phone: updatedBooking.phone });
        if (lineUser) {
            const dayMapping = ['日', '一', '二', '三', '四', '五', '六'];
            const weekDay = dayMapping[new Date(updatedBooking.date).getDay()];
            const seatedTime = new Date().toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const messageTemplate = JSON.parse(JSON.stringify(seatedNotificationTemplate));
            messageTemplate.body.contents[0].text = `${updatedBooking.name}，您好！`;
            const reservationInfo = messageTemplate.body.contents[1].contents;
            
            reservationInfo.forEach(box => {
                const label = box.contents[0].text;
                switch(label) {
                    case "日期":
                        // 使用 en-CA 格式但轉換為繁體中文顯示
                        const formattedDate = new Date(updatedBooking.date)
                            .toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
                            .replace(/-/g, '年')
                            .replace(/年(\d{2})年/, '年$1月')
                            .replace(/月(\d{2})$/, '月$1日');
                        box.contents[1].text = `${formattedDate} ${weekDay}`;
                        break;
                    case "入座時間":
                        box.contents[1].text = seatedTime;
                        break;
                }
            });

            await sendLineMessage(lineUser.lineUserId, {
                type: 'flex',
                altText: '入座通知',
                contents: messageTemplate
            });
        }

        res.json({ message: '已更新入座狀態', booking: updatedBooking });
    } catch (error) {
        console.error('更新入座狀態失敗:', error);
        res.status(500).json({ message: '更新入座狀態時發生錯誤' });
    }
});

app.post('/api/reservations/manual-cancel', async (req, res) => {
    try {
        const { bookingCode, reason, staffName } = req.body;

        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
        
        // 驗證輸入
        if (!bookingCode || !reason || !staffName) {
            return res.status(400).json({ error: '缺少必要資訊' });
        }

        // 查找並更新訂位
        const reservation = await Reservation.findOneAndUpdate(
            { 
                bookingCode,
                canceled: { $ne: true }
            },
            { 
                canceled: true,
                cancelReason: reason,
                canceledBy: staffName,
                canceledAt: new Date(),
                cancelType: 'manual'
            },
            { new: true }
        );

        if (!reservation) {
            return res.status(404).json({ error: '找不到有效的訂位' });
        }

        // 更新時段計數
        const date = reservation.date;
        const time = reservation.time;
        const hour = parseInt(time.split(':')[0]);
        const dayOfWeek = new Date(date).getDay();
        
        // 確定是平日還是假日
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        const Model = isWeekday ? GLW : GLH;
        
        // 確定時段代碼
        let timeSlot;
        if (isWeekday) {
            if (hour === 11) timeSlot = 'wm1';
            else if (hour === 12) timeSlot = 'wm2';
            else if (hour === 13) timeSlot = 'wm3';
            else if (hour === 17) timeSlot = 'wa1';
            else if (hour === 18) timeSlot = 'wa2';
            else if (hour >= 19) timeSlot = 'wa3';
        } else {
            if (hour === 11) timeSlot = 'hm1';
            else if (hour === 12) timeSlot = 'hm2';
            else if (hour === 13) timeSlot = 'hm3';
            else if (hour === 14) timeSlot = 'hm4';
            else if (hour === 17) timeSlot = 'ha1';
            else if (hour === 18) timeSlot = 'ha2';
            else if (hour >= 19) timeSlot = 'ha3';
        }

        console.log('Updating time slot:', { date, timeSlot, isWeekday }); // 添加日誌

        // 更新時段資料
        const updateResult = await Model.updateOne(
            { date },
            { $inc: { [timeSlot]: -1 } }
        );
        console.log('Time slot update result:', updateResult); // 添加日誌

        // 取得星期幾的字串
        const dayMapping = ['日', '一', '二', '三', '四', '五', '六'];
        const weekDay = dayMapping[dayOfWeek];

        // 準備通知內容
        const messageTemplate = JSON.parse(JSON.stringify(manualCancelNotificationTemplate));
        
        // 更新模板內容
        messageTemplate.body.contents.forEach(content => {
            if (content.type === 'text') {
                const text = content.text;
                if (text.includes('姓名：')) {
                    content.text = `姓名：${reservation.name}`;
                } else if (text.includes('電話：')) {
                    content.text = `電話：${reservation.phone}`;
                } else if (text.includes('電子郵件：')) {
                    content.text = `電子郵件：${reservation.email}`;
                } else if (text.includes('日期：')) {
                    content.text = `日期：${reservation.date} (${weekDay})`;
                } else if (text.includes('取消時間：')) {
                    content.text = `取消時間：${today}`;
                } else if (text.includes('取消原因：')) {
                    content.text = `取消原因：${reason}`;
                } else if (text.includes('取消者：')) {
                    content.text = `取消者：${staffName}`;
                }
            }
        });
        

        // 使用正確格式發送LINE通知
        await sendLineMessage('U249a6f35efe3b1f769228683a1d36e13', {
            type: 'flex',
            altText: '手動訂位取消通知',
            contents: messageTemplate
        });


        // 發送通知給客人
        if (reservation.email) {
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: reservation.email,
                subject: '芝麻柚子 とんかつ | 訂位取消通知',
                html: `
                    <div style="font-family: 'Microsoft JhengHei', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #333;">訂位取消通知</h2>
                        <p style="color: #666;">${reservation.name} 您好，</p>
                        <p style="color: #666;">很抱歉通知您，您的訂位已被取消：</p>
                        
                        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>訂位資訊：</strong></p>
                            <p style="margin: 5px 0;">姓名：${reservation.name}</p>
                            <p style="margin: 5px 0;">日期：${reservation.date} (${weekDay})</p>
                            <p style="margin: 5px 0;">時間：${reservation.time}</p>
                            <p style="margin: 5px 0;">取消原因：${reason}</p>
                        </div>

                        <p style="color: #666;">如有任何疑問，請與我們聯繫。</p>
                        
                        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                            <p style="color: #999; font-size: 14px;">芝麻柚子 とんかつ</p>
                            <p style="color: #999; font-size: 14px;">電話：03 558 7360</p>
                            <p style="color: #999; font-size: 14px;">地址：新竹縣竹北市光明一路490號</p>
                        </div>
                    </div>
                `
            });
        }
        
        // 如果客人有 Line 帳號，發送 Line 通知
        const lineUser = await UserID.findOne({ phone: reservation.phone });
        if (lineUser) {
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
            const messageTemplate = JSON.parse(JSON.stringify(customerNotificationTemplate));
            
            // 更新問候語
            if (messageTemplate.body?.contents?.[0]) {
                messageTemplate.body.contents[0].text = `${lineUser.lineName}，您好！`;
            }
        
            // 確保 reservationInfo 是一個陣列
            const reservationInfo = messageTemplate.body.contents[1]?.contents;
            if (Array.isArray(reservationInfo)) {
                reservationInfo.forEach(content => {
                    if (content.type === 'text') {
                        if (content.text.includes('日期：')) {
                            content.text = `日期：${reservation.date} (${weekDay})`;
                        } else if (content.text.includes('取消時間：')) {
                            content.text = `取消時間：${today}`;
                        } else if (content.text.includes('取消原因：')) {
                            content.text = `取消原因：${reason}`;
                        }
                    }
                });
            } else {
                console.error('Invalid reservationInfo structure:', reservationInfo);
            }
        
            // 發送 LINE 訊息
            await sendLineMessage(lineUser.lineUserId, {
                type: 'flex',
                altText: '訂位取消通知',
                contents: messageTemplate
            });
        }
        res.json({ message: '訂位已成功取消' });
    } catch (error) {
        console.error('取消訂位失敗:', error);
        res.status(500).json({ error: '取消訂位時發生錯誤' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Connected to database: ${mongoose.connection.name}`);
});
