const mongoose = require('mongoose');
require('dotenv').config();

// 定義 UserID Schema
const userIDSchema = new mongoose.Schema({
    lineUserId: String,
    lineName: String,
    phone: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { collection: 'userid' });

// 創建 UserID model
const UserID = mongoose.model('UserID', userIDSchema);

const connectToDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        mongoose.set('strictQuery', false);
        console.log('MongoDB connected');

        // 明確取得集合（保持原有的 bookings）
        const database = mongoose.connection.db;
        const bookingsCollection = database.collection('bookings');
        
        return bookingsCollection;  // 保持原有的返回值
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

module.exports = {
    connectToDatabase,
    UserID  // 只添加 UserID model 的導出
};
