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
    notes: { type: String, required: false },
});
reservationSchema.index({ phone: 1, date: 1, time: 1 }, { unique: true });

const Reservation = mongoose.model('Reservation', reservationSchema, 'bookings');

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'html', 'index.html')));
app.get('/form', (req, res) => res.sendFile(path.join(__dirname, 'html', 'form.html')));
app.get('/questions', (req, res) => res.sendFile(path.join(__dirname, 'html', 'questions.html')));
app.get('/menu', (req, res) => res.sendFile(path.join(__dirname, 'html', 'menu.html')));

function generateToken(length = 8) {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

app.post('/reservations', async (req, res) => {
    const { name, phone, email, gender, date, time, adults, children, vegetarian, specialNeeds, notes } = req.body;
    const token = generateToken(8);
    const expiration = 120; 


    const phoneRegex = /^09\d{8}$/;
    if (!phoneRegex.test(phone)) return res.status(400).json({ success: false, message: '電話格式不正確，請使用台灣手機格式' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ success: false, message: '電子郵件格式不正確' });

    if (!time || time.trim() === "") return res.status(400).json({ success: false, message: '請選擇用餐時間。' });

    try {
        const reservation = new Reservation({ name, phone, email, gender, date, time, adults, children, vegetarian, specialNeeds, notes });
        await reservation.save();

        await redisClient.set(token, JSON.stringify({
            name,
            phone,
            gender,
            date,
            time,
        }), 'EX', expiration);
        res.cookie('token', token, { httpOnly: true });
        
        res.json({ success: true, redirectUrl: `/${token}/success` });
    } catch (error) {
        res.status(500).json({ success: false, message: '訂位失敗，請稍後再試。', error: error.message });
    }
});

app.get('/:token/success', async (req, res) => {
    const token = req.params.token;
    const user = await redisClient.get(token);

    if (!user) {
        return res.redirect(`/form?error=invalid_token`);
    }

    res.sendFile(path.join(__dirname, 'html', 'success.html'));
});

// app.get('/success', (req, res) => {
//     const { token } = req.query;
//     if (!token || token !== req.session.token) {
//         return res.redirect('/form'); 
//     }
//     req.session.token = null;
//     res.sendFile(path.join(__dirname, 'html', 'success.html'));
// });

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
