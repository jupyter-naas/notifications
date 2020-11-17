import express from 'express';
import morgan from 'morgan';
import fileUpload from 'express-fileupload';
import Sentry from '@sentry/node';
import Tracing from '@sentry/tracing';
import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { join } from 'path';
import seq from 'sequelize';
import axios from 'axios';
import * as uuid from 'uuid';

const uri = process.env.PROXY_DB;
let sequelize;

if (uri) {
    sequelize = new seq.Sequelize(uri, { logging: false });
} else {
    sequelize = new seq.Sequelize({
        dialect: 'sqlite',
        storage: 'database.sqlite',
        // eslint-disable-next-line no-console
        // logging: (...msg) => console.log(msg), // Displays all log function call parameters
    });
}
const Notif = sequelize.define('Notif', {
    user: {
        type: seq.DataTypes.STRING,
        allowNull: false,
    },
    subject: {
        type: seq.DataTypes.STRING,
        allowNull: false,
    },
    to: {
        type: seq.DataTypes.STRING,
        allowNull: false,
    },
    from: {
        type: seq.DataTypes.STRING,
        allowNull: false,
    },
});

const app = express();
const port = (process.env.PORT || 3003);
const hubHost = process.env.HUB_HOST || 'app.naas.ai';
const adminToken = process.env.ADMIN_TOKEN || uuid.v4();
const emailFrom = process.env.emailFrom || 'notifications@naas.ai';
const configString = `${process.env.EMAIL_SECURE ? 'smtps' : 'smtp'}://${process.env.EMAIL_USER}:${process.env.EMAIL_PASSWORD}@${process.env.EMAIL_HOST}`;

app.set('port', port);
app.use(morgan('tiny'));
app.use(express.json());
app.use(fileUpload());
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations: [
            new Sentry.Integrations.Http({ tracing: true }),
            new Tracing.Integrations.Express({ app }),
        ],
        tracesSampleRate: 1.0,
    });
    app.use(Sentry.Handlers.requestHandler());
    app.use(Sentry.Handlers.tracingHandler());
}

const transporterNM = nodemailer.createTransport(configString);

const loadEmail = (name) => {
    try {
        const directoryPath = join(process.cwd(), '/emails');
        const template = readFileSync(`${directoryPath}/${name}.html`, 'utf8');
        return template;
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('loadEmail Error:', e.stack);
        return null;
    }
};

const send = async (req, res) => {
    if (!req.body || !req.body.email || !req.body.email === '') {
        // eslint-disable-next-line no-console
        console.error('Send Error:', 'Missing body or email');
        return res.status(500).send({ error: 'Missing body or email' });
    }
    const from = req.body.from || emailFrom;
    const mailOptions = {
        from,
        to: req.body.email,
        subject: req.body.subject,
        text: req.body.content,
        attachments: [],
        html: req.body.html || req.body.content,
    };
    if (req.files) {
        Object.values(req.files)
            .forEach((file) => {
                const fileObj = {
                    filename: file.name,
                    contentType: file.mimetype,
                    content: file.data,
                };
                mailOptions.attachments.push(fileObj);
            });
    }
    try {
        await transporterNM.sendMail(mailOptions);
        Notif.create({
            user: req.auth.email,
            from,
            to: req.body.email,
            subject: req.body.subject,
        });
        return res.json({ email: 'send' });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Send Error:', err);
        return res.status(500).send({ error: err });
    }
};

const sendStatus = async (req, res) => {
    if (!req.body || !req.body.email || !req.body.email === '') {
        // eslint-disable-next-line no-console
        console.error('Send Error:', 'Missing body or email');
        return res.status(500).send({ error: 'Missing body or email' });
    }
    const from = req.body.from || emailFrom;
    let template = loadEmail('status');
    template = template.split('%EMAIL_FROM%').join(from);
    template = template.split('%TITLE%').join(req.body.title);
    template = template.split('%EMAIL%').join(req.body.email);
    template = template.split('%SUBJECT%').join(req.body.subject);
    template = template.split('%CONTENT%').join(req.body.content);
    if (req.body && req.body.custom_vars && typeof req.body.custom_vars === 'object') {
        Object.entries(req.body.custom_vars).forEach(([key, value]) => {
            template = template.split(`%${key.toUpperCase()}%`).join(value);
        });
    }
    const mailOptions = {
        from,
        to: req.body.email,
        subject: req.body.subject,
        text: req.body.content,
        attachments: [],
        html: template,
    };
    if (req.files) {
        Object.values(req.files)
            .forEach((file) => {
                const fileObj = {
                    filename: file.name,
                    contentType: file.mimetype,
                    content: file.data,
                };
                mailOptions.attachments.push(fileObj);
            });
    }
    try {
        await transporterNM.sendMail(mailOptions);
        Notif.create({
            user: req.auth.email,
            from,
            to: req.body.email,
            subject: req.body.subject,
        });
        return res.json({ email: 'send' });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Send Status Error:', err);
        return res.status(500).send({ error: err });
    }
};

const router = express.Router();

const authToHub = async (req, res, next) => {
    try {
        if (req.headers.authorization === adminToken) {
            req.auth = { email: emailFrom };
            return next();
        }
        const options = {
            headers: {
                'content-type': 'application/json',
                authorization: req.headers.authorization,
            },
        };
        const result = await axios.get(`https://${hubHost}/hub/api/user`, options);
        if (!result || !result.data || !result.data.name) {
            throw Error('User not found');
        }
        req.auth = { email: result.data.name };
        return next();
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Auth Error:', err);
        return res.status(500).send(err);
    }
};
router.route('/send').post(authToHub, send);
router.route('/send_status').post(authToHub, sendStatus);

app.use('/', router);
app.get('/', (req, res) => res.status(200).json({ status: 'ok' }));
if (process.env.SENTRY_DSN) {
    app.use(Sentry.Handlers.errorHandler());
    // eslint-disable-next-line no-console
    console.log('Sentry enabled', process.env.SENTRY_DSN);
}
// eslint-disable-next-line no-console
console.log('Start server');
app.listen(app.get('port'), () => {
    sequelize.authenticate().then(async () => {
        await Notif.sync();
        // eslint-disable-next-line no-console
        console.log('Connection has been established successfully.');
        // eslint-disable-next-line no-console
        console.log(`Notification PID ${process.pid}, port ${app.get('port')}, http://localhost:${app.get('port')}`);
    }).catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Unable to connect to the database:', error);
    });
});
