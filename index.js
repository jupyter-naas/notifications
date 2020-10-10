import express from 'express';
import morgan from 'morgan';
import fileUpload from 'express-fileupload';
import Sentry from '@sentry/node';
import Tracing from '@sentry/tracing';
import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { join } from 'path';

const app = express();
const port = (process.env.PORT || 3003);
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

const emailFrom = process.env.emailFrom || 'notifications@naas.ai';
const configString = `${process.env.EMAIL_SECURE ? 'smtps' : 'smtp'}://${process.env.EMAIL_USER}:${process.env.EMAIL_PASSWORD}@${process.env.EMAIL_HOST}`;
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
    if (req.body.email && req.body.email !== '') {
        const mailOptions = {
            from: emailFrom,
            to: req.body.email,
            subject: req.body.subject,
            text: req.body.content,
            attachments: [],
            html: req.body.html || req.body.content,
        };
        if (req.files) {
            req.files.forEach((file) => {
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
            return res.json({ email: 'send' });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Send Error:', err);
            return res.status(500).send({ error: err });
        }
    }
    return res.status(500).send({ error: 'no email provided' });
};

const sendStatus = async (req, res) => {
    if (req.body.email && req.body.email !== '') {
        let template = loadEmail('status');
        template = template.split('%EMAIL_FROM%').join(emailFrom);
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
            from: emailFrom,
            to: req.body.email,
            subject: req.body.subject,
            text: req.body.content,
            attachments: [],
            html: template,
        };
        if (req.files) {
            Object.value(req.files)
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
            return res.json({ email: 'send' });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Send Status Error:', err);
            return res.status(500).send({ error: err });
        }
    }
    return res.status(500).send({ error: 'no email provided' });
};

const router = express.Router();
// notification

router.route('/send').post(send);
router.route('/send_status').post(sendStatus);

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
    // eslint-disable-next-line no-console
    console.log(`notification PID ${process.pid}, port ${app.get('port')}, http://localhost:${app.get('port')}`);
});
