// Node version 5.2.3 being used by default on aws 
var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var cp = require('child_process');
var responseTime = require('response-time');
var assert = require('assert');
var helmet = require('helmet');
var RateLimit = require('express-rate-limit');
var csp = require('helmet-csp');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

var users = require('./routes/users');
var session = require('./routes/session');
var sharedNews = require('./routes/sharedNews');
var homeNews = require('./routes/homeNews');

var app = express();
app.enable('trust proxy');

var limiter = new RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    delayMs: 0
});
app.use(limiter);

app.use(helmet());
app.use(csp({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'selfl'", "'unsafe-inline'", 'ajax.googleapis.com', 'maxcdn.bootstrapcdn.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'maxcdn.bootstrapcdn.com'],
        fontSrc: ["'self'", 'maxcdn.bootstrap.com'],
        imgSrc: ['*']
    }
}));

app.use(responseTime());

app.use(logger('dev'));

app.use(bodyParser.json({limit: '100kb'}));

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'build')));

var node2 = cp.fork('./worker/app_FORK.js');

node2.on('exit', function (code) {
    node2 = undefined;
    node2 = cp.fork('./worker/app_FORK.js');
});

var db = {};
var MongoClient = require('mongodb').MongoClient;

MongoClient.connect(process.env.MONGODB_CONNECT_URL, { useNewUrlParser: true }, function (err, client) {
    assert.equal(null, err);
    db.client = client;
    db.collection = client.db('newswatcherdb').collection('newswatcher');
});

app.use(function (req, res, next) {
    req.db = db;
    req.node2 = node2;
    next();
});

app.use('api/users', users);
app.use('api/sessions', session);
app.use('api/sharednews', sharedNews);
app.use('/api/homenews', homeNews);

app.use(function (req, res, next) {
    var err = new Error('Not Found!');
    err.status = 404;
    next(err);
});

if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500).json({ message: err.toString(), error: err });
        console.log(err);
    });
};

app.use(function (err, req, res, next) {
    res.status(err.status || 500).json({ message: err.toString(), error: {}});
    console.log(err);
});

app.set('port', process.env.port || 8080);

var server = app.listen(app.get('port'), function () {
    console.log('Express server listening on port:' + 
    server.address().port);
});

server.db = db;
server.node2 = node2;

module.exports = server;