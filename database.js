const mongoose = require('mongoose');
require('dotenv').config();

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
    createdAt: { type: Date, default: Date.now }
});

const glwSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    wm1: { type: Number, default: 0 },
    wm2: { type: Number, default: 0 },
    wm3: { type: Number, default: 0 },
    wa1: { type: Number, default: 0 },
    wa2: { type: Number, default: 0 },
    wa3: { type: Number, default: 0 }
});

const glhSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true },
    hm1: { type: Number, default: 0 },
    hm2: { type: Number, default: 0 },
    hm3: { type: Number, default: 0 },
    hm4: { type: Number, default: 0 },
    ha1: { type: Number, default: 0 },
    ha2: { type: Number, default: 0 },
    ha3: { type: Number, default: 0 }
});

const settingsSchema = new mongoose.Schema({
    wm: { type: Number, default: 2 },
    wa: { type: Number, default: 2 },
    hm: { type: Number, default: 3 },
    ha: { type: Number, default: 3 },
    upt: { type: String, default: '-' }
});

reservationSchema.index({ phone: 1, date: 1, time: 1 }, { unique: true });
reservationSchema.index({ createdAt: 1 });

const userIDSchema = new mongoose.Schema({
    lineUserId: { type: String, required: true, unique: true },
    lineName: { type: String, required: true },
    phone: { type: String, required: true, unique: true }
});

const Reservation = mongoose.model('Reservation', reservationSchema, 'bookings');  // 將會建立名為 'bookings' 的集合
const UserID = mongoose.model('UserID', userIDSchema, 'userids');
const GLW = mongoose.model('GLW', glwSchema, 'glw');
const GLH = mongoose.model('GLH', glhSchema, 'glh');
const Settings = mongoose.model('Settings', settingsSchema, 'settings');

async function connectToDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

module.exports = {
    connectToDatabase,
    Reservation,
    UserID,
    GLW,
    GLH,
    Settings
};
