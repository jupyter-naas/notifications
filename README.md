# Naas Notifications

Notification service to run side to side with naas.
Allow naas to send status to user and custom notifications

## Env vars 

`EMAIL_SECURE` ssl or not .

`EMAIL_USER` email to connect smtp server

`EMAIL_PASSWORD` password to connect smtp server

`EMAIL_HOST` host to connect smtp server

`SENTRY_DSN` to connect sentry

`HUB_HOST` => hostname of the deployed jupyter hub instance

`PROXY_DB` => 'sqlite::memory:' or postgressuri 'postgres://user:pass@example.com:5432/dbname'