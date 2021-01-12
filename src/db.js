import sequelize from 'sequelize';

const uri = process.env.PROXY_DB;
let sql;

if (uri) {
    sql = new sequelize.Sequelize(uri, { logging: false });
} else {
    sql = new sequelize.Sequelize({
        dialect: 'sqlite',
        storage: 'database.sqlite',
        // eslint-disable-next-line no-console
        // logging: (...msg) => console.log(msg), // Displays all log function call parameters
    });
}

export const Notif = sql.define('Notif', {
    user: {
        type: sequelize.DataTypes.STRING,
        allowNull: false,
    },
    subject: {
        type: sequelize.DataTypes.STRING,
        allowNull: false,
    },
    to: {
        type: sequelize.DataTypes.STRING,
        allowNull: false,
    },
    from: {
        type: sequelize.DataTypes.STRING,
        allowNull: false,
    },
});

export const Sequelize = sql;
