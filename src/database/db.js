const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../database/store.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database tables
function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE NOT NULL,
            username TEXT,
            balance INTEGER DEFAULT 0,
            total_spent INTEGER DEFAULT 0,
            verified INTEGER DEFAULT 0,
            is_admin INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            emoji TEXT DEFAULT '📦',
            description TEXT,
            order_num INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            description TEXT,
            price INTEGER NOT NULL,
            image_url TEXT,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS stocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            status TEXT DEFAULT 'available', -- 'available' | 'sold'
            order_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            sold_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice TEXT UNIQUE NOT NULL,
            user_id INTEGER,
            discord_id TEXT NOT NULL,
            product_id INTEGER,
            product_name TEXT,
            quantity INTEGER DEFAULT 1,
            unit_price INTEGER,
            total_price INTEGER,
            payment_method TEXT, -- 'QRIS' | 'SALDO'
            status TEXT DEFAULT 'PENDING', -- 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'
            trx_id TEXT,
            qris_code TEXT,
            items_delivered TEXT, -- JSON string
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            paid_at DATETIME,
            expires_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS topups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice TEXT UNIQUE NOT NULL,
            user_id INTEGER,
            discord_id TEXT NOT NULL,
            nominal INTEGER NOT NULL,
            unique_code INTEGER DEFAULT 0,
            total_amount INTEGER NOT NULL,
            status TEXT DEFAULT 'PENDING', -- 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'
            trx_id TEXT,
            qris_code TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            paid_at DATETIME,
            expires_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);

    // Insert initial categories if empty
    const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
    if (catCount === 0) {
        const insertCat = db.prepare('INSERT INTO categories (name, emoji, description, order_num) VALUES (?, ?, ?, ?)');
        const cat1 = insertCat.run('Game Keys & Steam', '🎮', 'Produk game keys, Steam key, activation code', 1).lastInsertRowid;
        const cat2 = insertCat.run('Discord Nitro', '🚀', 'Nitro Boost, Basic, Gift & Promo links', 2).lastInsertRowid;
        const cat3 = insertCat.run('Premium Account', '⭐', 'Spotify, Netflix, YouTube Premium, dll', 3).lastInsertRowid;

        // Sample product
        const insertProduct = db.prepare('INSERT INTO products (category_id, name, description, price, image_url) VALUES (?, ?, ?, ?, ?)');
        const p1 = insertProduct.run(cat1, 'Steam Random Key VIP', 'Key Steam Global Original. Garansi jalan dan bisa redeem.', 15000, 'https://cdn-icons-png.flaticon.com/512/888/888870.png').lastInsertRowid;
        const p2 = insertProduct.run(cat2, 'Discord Nitro 1 Bulan (Promo)', 'Link aktivasi Discord Nitro 1 Bulan + 2 Boost.', 25000, 'https://cdn-icons-png.flaticon.com/512/5968/5968756.png').lastInsertRowid;

        // Add sample stock
        const insertStock = db.prepare('INSERT INTO stocks (product_id, content, status) VALUES (?, ?, ?)');
        insertStock.run(p1, 'STEAM-VIP-A8934-KJDF9-8923K', 'available');
        insertStock.run(p1, 'STEAM-VIP-ZX781-OP981-LMAO9', 'available');
        insertStock.run(p2, 'https://discord.com/billing/promotions/sample-nitro-token-1', 'available');
    }
}

initSchema();

// === Helper Functions ===

// Users
function getUser(discordId, username = null) {
    let user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
    if (!user) {
        db.prepare('INSERT INTO users (discord_id, username, balance) VALUES (?, ?, 0)').run(discordId, username || 'Unknown');
        user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
    } else if (username && user.username !== username) {
        db.prepare('UPDATE users SET username = ? WHERE discord_id = ?').run(username, discordId);
        user.username = username;
    }
    return user;
}

function setUserVerified(discordId, verified = 1) {
    return db.prepare('UPDATE users SET verified = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?').run(verified, discordId);
}

function updateBalance(discordId, amountChange) {
    const user = getUser(discordId);
    const newBalance = (user.balance || 0) + amountChange;
    db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?').run(newBalance, discordId);
    return newBalance;
}

function getAllUsers() {
    return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
}

function updateUserAdmin(discordId, isAdmin) {
    return db.prepare('UPDATE users SET is_admin = ? WHERE discord_id = ?').run(isAdmin ? 1 : 0, discordId);
}

// Categories & Products
function getCategories() {
    return db.prepare('SELECT * FROM categories ORDER BY order_num ASC, id ASC').all();
}

function getProducts(categoryId = null, activeOnly = true) {
    let sql = `
        SELECT p.*, c.name as category_name, c.emoji as category_emoji,
        (SELECT COUNT(*) FROM stocks WHERE product_id = p.id AND status = 'available') as stock_count
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (activeOnly) conditions.push('p.active = 1');
    if (categoryId) {
        conditions.push('p.category_id = ?');
        params.push(categoryId);
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY p.id DESC';
    return db.prepare(sql).all(...params);
}

function getProductById(id) {
    return db.prepare(`
        SELECT p.*, c.name as category_name, c.emoji as category_emoji,
        (SELECT COUNT(*) FROM stocks WHERE product_id = p.id AND status = 'available') as stock_count
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ?
    `).get(id);
}

function createProduct(categoryId, name, description, price, imageUrl) {
    return db.prepare('INSERT INTO products (category_id, name, description, price, image_url) VALUES (?, ?, ?, ?, ?)').run(categoryId, name, description, price, imageUrl);
}

function updateProduct(id, categoryId, name, description, price, imageUrl, active = 1) {
    return db.prepare('UPDATE products SET category_id = ?, name = ?, description = ?, price = ?, image_url = ?, active = ? WHERE id = ?').run(categoryId, name, description, price, imageUrl, active, id);
}

function deleteProduct(id) {
    return db.prepare('DELETE FROM products WHERE id = ?').run(id);
}

function createCategory(name, emoji, description, orderNum = 0) {
    return db.prepare('INSERT INTO categories (name, emoji, description, order_num) VALUES (?, ?, ?, ?)').run(name, emoji, description, orderNum);
}

function deleteCategory(id) {
    return db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}

// Stocks
function getAvailableStockCount(productId) {
    return db.prepare("SELECT COUNT(*) as count FROM stocks WHERE product_id = ? AND status = 'available'").get(productId).count;
}

function getAvailableStocks(productId, limit = 1) {
    return db.prepare("SELECT * FROM stocks WHERE product_id = ? AND status = 'available' LIMIT ?").all(productId, limit);
}

function claimStocks(stockIds, orderId) {
    const placeholders = stockIds.map(() => '?').join(',');
    const stmt = db.prepare(`UPDATE stocks SET status = 'sold', order_id = ?, sold_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`);
    return stmt.run(orderId, ...stockIds);
}

function addStocks(productId, itemsArray) {
    const insert = db.prepare('INSERT INTO stocks (product_id, content, status) VALUES (?, ?, ?)');
    const insertMany = db.transaction((items) => {
        let count = 0;
        for (const item of items) {
            const trimmed = item.trim();
            if (trimmed.length > 0) {
                insert.run(productId, trimmed, 'available');
                count++;
            }
        }
        return count;
    });
    return insertMany(itemsArray);
}

function getAllStocks(productId = null) {
    if (productId) {
        return db.prepare(`
            SELECT s.*, p.name as product_name
            FROM stocks s
            JOIN products p ON s.product_id = p.id
            WHERE s.product_id = ?
            ORDER BY s.id DESC
        `).all(productId);
    }
    return db.prepare(`
        SELECT s.*, p.name as product_name
        FROM stocks s
        JOIN products p ON s.product_id = p.id
        ORDER BY s.id DESC
    `).all();
}

function deleteStock(id) {
    return db.prepare('DELETE FROM stocks WHERE id = ?').run(id);
}

// Orders
function createOrder(orderData) {
    const stmt = db.prepare(`
        INSERT INTO orders (
            invoice, user_id, discord_id, product_id, product_name,
            quantity, unit_price, total_price, payment_method, status,
            trx_id, qris_code, expires_at
        ) VALUES (
            @invoice, @userId, @discordId, @productId, @productName,
            @quantity, @unitPrice, @totalPrice, @paymentMethod, @status,
            @trxId, @qrisCode, @expiresAt
        )
    `);
    const result = stmt.run(orderData);
    return result.lastInsertRowid;
}

function getOrder(invoice) {
    return db.prepare('SELECT * FROM orders WHERE invoice = ?').get(invoice);
}

function getPendingOrders() {
    return db.prepare("SELECT * FROM orders WHERE status = 'PENDING'").all();
}

function updateOrderStatus(invoice, status, deliveredItems = null) {
    const order = getOrder(invoice);
    if (!order) return null;

    if (status === 'PAID') {
        db.prepare(`
            UPDATE orders
            SET status = ?, paid_at = CURRENT_TIMESTAMP, items_delivered = ?
            WHERE invoice = ?
        `).run(status, deliveredItems ? JSON.stringify(deliveredItems) : null, invoice);

        // Update user total spent
        db.prepare('UPDATE users SET total_spent = total_spent + ? WHERE discord_id = ?').run(order.total_price, order.discord_id);
    } else {
        db.prepare('UPDATE orders SET status = ? WHERE invoice = ?').run(status, invoice);
    }
    return getOrder(invoice);
}

function getUserOrders(discordId) {
    return db.prepare('SELECT * FROM orders WHERE discord_id = ? ORDER BY id DESC').all(discordId);
}

function getAllOrders(limit = 100) {
    return db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT ?').all(limit);
}

// Topups
function createTopup(topupData) {
    const stmt = db.prepare(`
        INSERT INTO topups (
            invoice, user_id, discord_id, nominal, unique_code,
            total_amount, status, trx_id, qris_code, expires_at
        ) VALUES (
            @invoice, @userId, @discordId, @nominal, @uniqueCode,
            @totalAmount, @status, @trxId, @qrisCode, @expiresAt
        )
    `);
    const result = stmt.run(topupData);
    return result.lastInsertRowid;
}

function getTopup(invoice) {
    return db.prepare('SELECT * FROM topups WHERE invoice = ?').get(invoice);
}

function getPendingTopups() {
    return db.prepare("SELECT * FROM topups WHERE status = 'PENDING'").all();
}

function updateTopupStatus(invoice, status) {
    const topup = getTopup(invoice);
    if (!topup) return null;

    if (status === 'PAID') {
        db.prepare('UPDATE topups SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE invoice = ?').run(status, invoice);
        // Credit user balance with total amount (nominal + unique code)
        updateBalance(topup.discord_id, topup.total_amount);
    } else {
        db.prepare('UPDATE topups SET status = ? WHERE invoice = ?').run(status, invoice);
    }
    return getTopup(invoice);
}

function getUserTopups(discordId) {
    return db.prepare('SELECT * FROM topups WHERE discord_id = ? ORDER BY id DESC').all(discordId);
}

function getAllTopups(limit = 100) {
    return db.prepare('SELECT * FROM topups ORDER BY id DESC LIMIT ?').all(limit);
}

// Settings
function getSetting(key, defaultValue = null) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
}

function setSetting(key, value) {
    return db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, value, value);
}

// Stats for Dashboard
function getDashboardStats() {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE active = 1').get().count;
    const availableStocks = db.prepare("SELECT COUNT(*) as count FROM stocks WHERE status = 'available'").get().count;
    const soldStocks = db.prepare("SELECT COUNT(*) as count FROM stocks WHERE status = 'sold'").get().count;

    const ordersPaid = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as total FROM orders WHERE status = 'PAID'").get();
    const todayOrders = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as total FROM orders WHERE status = 'PAID' AND date(paid_at) = date('now')").get();

    const topupsPaid = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(nominal), 0) as total FROM topups WHERE status = 'PAID'").get();

    return {
        totalUsers,
        totalProducts,
        availableStocks,
        soldStocks,
        totalSalesCount: ordersPaid.count,
        totalRevenue: ordersPaid.total,
        todaySalesCount: todayOrders.count,
        todayRevenue: todayOrders.total,
        totalTopupsCount: topupsPaid.count,
        totalTopupsAmount: topupsPaid.total
    };
}

module.exports = {
    db,
    getUser,
    setUserVerified,
    updateBalance,
    getAllUsers,
    updateUserAdmin,
    getCategories,
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    createCategory,
    deleteCategory,
    getAvailableStockCount,
    getAvailableStocks,
    claimStocks,
    addStocks,
    getAllStocks,
    deleteStock,
    createOrder,
    getOrder,
    getPendingOrders,
    updateOrderStatus,
    getUserOrders,
    getAllOrders,
    createTopup,
    getTopup,
    getPendingTopups,
    updateTopupStatus,
    getUserTopups,
    getAllTopups,
    getSetting,
    setSetting,
    getDashboardStats
};
