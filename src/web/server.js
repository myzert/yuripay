const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const expressLayouts = require('express-ejs-layouts');
const dashboardRoutes = require('./routes/dashboard');

function createWebServer() {
    const app = express();

    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');
    app.use(expressLayouts);
    app.set('layout', 'layout');

    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(__dirname, 'public')));

    app.use(session({
        secret: process.env.SESSION_SECRET || 'super_secret_gopay_merchant_key_892374',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
    }));

    // Pass session to views
    app.use((req, res, next) => {
        res.locals.session = req.session;
        next();
    });

    // Mount Routes
    app.use('/', dashboardRoutes);

    const port = process.env.WEB_PORT || 3000;
    const server = app.listen(port, () => {
        console.log(`[GoPay Merchant Portal] Running at http://localhost:${port}`);
    });

    return { app, server };
}

module.exports = {
    createWebServer
};
