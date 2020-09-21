import express from 'express';
import morgan from 'morgan';

import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { join } from 'path';

const app = express();
const port = (process.env.PORT || 3003);
app.set('port', port);
app.use(morgan('tiny'));
app.use(express.json());

const emailFrom = process.env.emailFrom || 'notification@naas.ai';

// if (!process.env.EMAIL_HOST
//     || !process.env.EMAIL_PORT
//     || !process.env.EMAIL_USER
//     || !process.env.EMAIL_PASSWORD
// ) {
//     // eslint-disable-next-line no-console
//     console.error('error in config');
//     process.exit(1);
// }
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
        let template = loadEmail('notification');
        template = template.split('%EMAIL%').join(req.body.email);
        template = template.split('%OBJECT%').join(req.body.object);
        template = template.split('%CONTENT%').join(req.body.content);
        if (req.body && req.body.vars && Array.isArray(req.body.vars)) {
            req.body.custom_vars.forEach((customVar) => {
                template = template.split(`%${customVar.toUpperCase()}%`).join(customVar);
            });
        }
        const mailOptions = {
            from: emailFrom,
            to: req.body.email,
            subject: req.body.object,
            text: req.body.content,
            html: template,
        };
        try {
            await transporterNM.sendMail(mailOptions);
            return res.json({ email: 'send' });
        } catch (err) {
            return res.status(500).send({ error: err });
        }
    }
    return res.status(500).send({ error: 'no email provided' });
};

const router = express.Router();
// notification

router.route('/send').post(send);

app.use('/notifications', router);
app.get('/', (req, res) => res.status(200).json({ status: 'ok' }));
// eslint-disable-next-line no-console
console.log('Start server');
app.listen(app.get('port'), () => {
    // eslint-disable-next-line no-console
    console.log(`notification PID ${process.pid}, port ${app.get('port')}, http://localhost:${app.get('port')}`);
});
