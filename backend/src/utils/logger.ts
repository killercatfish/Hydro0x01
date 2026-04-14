import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { translateTime: "SYS:standard", ignore: "pid,hostname" }
  }
});

export const createLogger = () => logger;
