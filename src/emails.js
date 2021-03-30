import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import express from 'express';
import { join } from 'path';
import axios from 'axios';
import * as uuid from 'uuid';
import {
    Notif,
} from './db';

const adminToken = process.env.ADMIN_TOKEN || uuid.v4();
const hubHost = process.env.HUB_HOST || 'app.naas.ai';
const configString = `${process.env.EMAIL_SECURE ? 'smtps' : 'smtp'}://${process.env.EMAIL_USER}:${process.env.EMAIL_PASSWORD}@${process.env.EMAIL_HOST}`;
const emailFrom = process.env.emailFrom || 'notifications@naas.ai';

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
        req.auth = { email: result.data.name, admin: result.data.admin };
        return next();
    } catch (err) {
        // eslint-disable-next-line no-console
        // console.error('Auth Error:', err);
        return res.status(500).send(err);
    }
};

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
    let from = emailFrom;
    if (req.auth.admin && req.body.from) {
        from = req.body.from
    } else if (req.body.from && req.body.from === req.auth.email) {
        from = req.body.from
    }
    const from = req.auth.admin && req.body.from ?  req.body.from : emailFrom;
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

const getList = async (req, res) => Notif.findAll({
    where: {
        user: req.auth.email,
    },
}).then((data) => res.send({ emails: data }))
    .catch((err) => res.status(500).json(err));

const getAdmin = async (req, res) => {
    if (req.auth.admin) {
        return Notif.findAll().then((data) => res.send({ emails: data }))
            .catch((err) => res.status(500).json(err));
    }
    return res.status(500).send({ error: 'Unable to access the data' });
};

const sendStatus = async (req, res) => {
    if (!req.body || !req.body.email || !req.body.email === '') {
        // eslint-disable-next-line no-console
        console.error('Send Error:', 'Missing body or email');
        return res.status(500).send({ error: 'Missing body or email' });
    }
    let from = emailFrom;
    if (req.auth.admin && req.body.from) {
        from = req.body.from
    } else if (req.body.from && req.body.from === req.auth.email) {
        from = req.body.from
    }
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

const routerEmail = express.Router();

//  REMOVE in next release
routerEmail.route('/send').post(authToHub, send);
routerEmail.route('/send_status').post(authToHub, sendStatus);
routerEmail.route('/list').post(authToHub, getList);
routerEmail.route('/list_all').post(authToHub, getAdmin);

routerEmail.route('/').post(authToHub, send);
routerEmail.route('/').get(authToHub, getList);
routerEmail.route('/status').post(authToHub, sendStatus);
routerEmail.route('/admin').get(authToHub, getAdmin);

export default routerEmail;
