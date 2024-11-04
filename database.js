const mongoose = require('mongoose');
require('dotenv').config();

const connectToDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        mongoose.set('strictQuery', false); // 或者設為 true
        console.log('MongoDB connected');

        // 明確取得集合（若需要直接在此使用）
        const database = mongoose.connection.db;
        const bookingsCollection = database.collection('bookings');
        
        return bookingsCollection;
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1); // 無法連線時退出應用程式
    }
};

module.exports = connectToDatabase;