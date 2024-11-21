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
    notes: String,
    reservationToken: { type: String }, 
    sessionId: { type: String },       
    createdAt: { type: Date, default: Date.now } 
});

const userIDSchema = new mongoose.Schema({
    lineUserId: { type: String, required: true, unique: true },
    lineName: { type: String, required: true },
    phone: { type: String, required: true, unique: true }
});

const Reservation = mongoose.model('Reservation', reservationSchema);
const UserID = mongoose.model('UserID', userIDSchema);

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
    UserID
};
