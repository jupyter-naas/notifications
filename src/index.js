import express from 'express';
import morgan from 'morgan';
import fileUpload from 'express-fileupload';
import Sentry from '@sentry/node';
import Tracing from '@sentry/tracing';
import routerEmail from './emails';
import {
    Notif, Sequelize,
} from './db';

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

app.use('/', routerEmail);
app.get('/', (req, res) => res.status(200).json({ status: 'ok' }));
if (process.env.SENTRY_DSN) {
    app.use(Sentry.Handlers.errorHandler());
    // eslint-disable-next-line no-console
    console.log('Sentry enabled', process.env.SENTRY_DSN);
}
// eslint-disable-next-line no-console
console.log('Start server');
app.listen(app.get('port'), async () => {
    try {
        await Sequelize.authenticate();
        await Notif.sync();
        // eslint-disable-next-line no-console
        console.log('Connection has been established successfully.');
        // eslint-disable-next-line no-console
        console.log(`Proxy PID ${process.pid}, port ${app.get('port')}, http://localhost:${app.get('port')}`);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Unable to connect to the database:', err);
    }
});
