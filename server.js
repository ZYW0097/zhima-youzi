const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const { createClient } = require('redis');
const RedisStore = require('connect-redis').default;
const cookieParser = require('cookie-parser');
const { connectToDatabase, Reservation, UserID, GLW, GLH, Settings } = require('./database');
const redisUrl = process.env.REDIS_URL;
const fs = require('fs');
const axios = require('axios');
const nodemailer = require('nodemailer');
const userStates = {};
const jwt = require('jsonwebtoken');
const CronJob = require('cron').CronJob;
const moment = require('moment-timezone');
const reservationSuccessTemplate = require('../line-templates/reservation-success.json');
const welcomeTemplate = require('../line-templates/welcome.json');
const bindingSuccessTemplate = require('../line-templates/binding-success.json');
const confirmReservationTemplate = require('../line-templates/confirm-reservation.json');
const confirmBindingTemplate = require('../line-templates/confirm-binding.json');


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
                res.redirect('/bsl');
            }).catch(() => {
                logAuth('SESSION_ERROR', 'unknown', false, ip);
                res.redirect('/bsl');
            });
            return;
        }
        logAuth('NO_TOKEN', 'unknown', false, ip);
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

app.post('/api/settings', async (req, res) => {
    try {
        const { wm, wa, hm, ha } = req.body;
        
        if (!wm || !wa || !hm || !ha || 
            wm < 0 || wa < 0 || hm < 0 || ha < 0) {
            return res.status(400).json({ error: '無效的設置值' });
        }

        await Settings.findOneAndUpdate(
            {},
            { 
                wm, wa, hm, ha,
                upt: moment.tz('Asia/Taipei').toDate()
            },
            { upsert: true, new: true }
        );

        res.json({ message: '設置更新成功' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: '更新設置失敗' });
    }
});

app.post('/reservations', async (req, res) => {
    try {
        console.log('Received reservation request:', req.body);
        
        const { 
            name, phone, email, gender, date, time, 
            adults, children, vegetarian, specialNeeds, notes 
        } = req.body;
        
        const token = generateToken();
        
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
                    notes
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
                    notes
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
                        }
                    });

                    await sendLineMessage(existingLineUser.lineUserId, {
                        type: 'flex',
                        altText: '訂位成功通知',
                        contents: messageTemplate
                    });
                }

                // 跳轉到成功頁面
                const redirectUrl = `https://zhima-youzi.onrender.com/${token}/success`;
                return res.redirect(redirectUrl);

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
                    notes
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
                    notes
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
                        }
                    });

                    await sendLineMessage(existingLineUser.lineUserId, {
                        type: 'flex',
                        altText: '訂位成功通知',
                        contents: messageTemplate
                    });
                }

                // 跳轉到成功頁面
                const redirectUrl = `https://zhima-youzi.onrender.com/${token}/success`;
                return res.redirect(redirectUrl);
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
                    notes
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
                    notes
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
                        }
                    });

                    await sendLineMessage(existingLineUser.lineUserId, {
                        type: 'flex',
                        altText: '訂位成功通知',
                        contents: messageTemplate
                    });
                }

                // 跳轉到成功頁面
                const redirectUrl = `https://zhima-youzi.onrender.com/${token}/success`;
                return res.redirect(redirectUrl);

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
                    notes
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
                    notes
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
                        }
                    });

                    await sendLineMessage(existingLineUser.lineUserId, {
                        type: 'flex',
                        altText: '訂位成功通知',
                        contents: messageTemplate
                    });
                }

                // 跳轉到成功頁面
                const redirectUrl = `https://zhima-youzi.onrender.com/${token}/success`;
                return res.redirect(redirectUrl);
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
                            await sendLineMessage(lineUserId, '請入要綁定的電話號碼：');
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
                    if (userStates[lineUserId] === 'WAITING_FOR_PHONE') { 
                        if (!phoneRegex.test(userMessage)) {
                            await sendLineMessage(lineUserId, '請輸入有效的手機號碼（例：0912345678）');
                            return;
                        }
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
                        const messageTemplate = JSON.parse(JSON.stringify(confirmReservationTemplate));

                        const maskedName = recentReservation.name.charAt(0) + '*'.repeat(recentReservation.name.length - 1);
                        const maskedPhone = `${phone.slice(0, 4)}**${phone.slice(-2)}`;
                        
                        await sendLineMessage(lineUserId, {
                            type: 'flex',
                            altText: '確認訂位資訊',
                            contents: messageTemplate
                        });
                    } else {
                        // 發送一般綁定確認
                        const messageTemplate = JSON.parse(JSON.stringify(confirmBindingTemplate));
                        // 更新電話號碼
                        messageTemplate.body.contents[1].text = phone;
                        // 更新確認按鈕的 data
                        messageTemplate.footer.contents[1].action.data = `action=confirm_general_binding&phone=${phone}`;

                        await sendLineMessage(lineUserId, {
                            type: 'flex',
                            altText: '確認綁定電話',
                            contents: messageTemplate
                        });
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
async function sendLineMessage(to, message) {
    try {
        // 先獲取用戶的 LINE 個人資料
        const userProfile = await axios.get(`https://api.line.me/v2/bot/profile/${to}`, {
            headers: {
                'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
            }
        });
        
        // 查找現有用戶資料
        const existingUser = await UserID.findOne({ lineUserId: to });
        
        // 如果名稱有變更才更新
        if (existingUser && existingUser.lineName !== userProfile.data.displayName) {
            console.log(`Updating LINE name for user ${to} from "${existingUser.lineName}" to "${userProfile.data.displayName}"`);
            
            await UserID.findOneAndUpdate(
                { lineUserId: to },
                { lineName: userProfile.data.displayName },
                { new: true }
            );
        }

        // 發送訊息
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
        console.error('Error in sendLineMessage:', error.response?.data || error);
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

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Connected to database: ${mongoose.connection.name}`);
});
