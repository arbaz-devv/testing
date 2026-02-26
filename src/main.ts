import 'dotenv/config';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import { Server } from 'socket.io';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { validateEnv } from './config/env.schema';
import { AllExceptionsFilter } from './common/http-exception.filter';
import './socket/socket.types';

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.useGlobalFilters(new AllExceptionsFilter());

  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const corsOrigins = config.corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (config.isProduction && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGIN must be set in production');
  }

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const allowedOrigins =
    corsOrigins.length > 0
      ? new Set(corsOrigins)
      : new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
  const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  // Basic CSRF protection for cookie-authenticated mutation requests.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!unsafeMethods.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const cookieHeader = req.headers.cookie ?? '';
    const hasSessionCookie = /(?:^|;\s*)session=/.test(cookieHeader);
    if (!hasSessionCookie) {
      next();
      return;
    }

    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;
    let requestOrigin = originHeader;

    if (!requestOrigin && refererHeader) {
      try {
        requestOrigin = new URL(refererHeader).origin;
      } catch {
        requestOrigin = undefined;
      }
    }

    if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
      res.status(403).json({ error: 'CSRF validation failed' });
      return;
    }

    next();
  });

  await app.listen(config.port);

  // Attach Socket.IO to the same HTTP server (for real-time review updates)
  const httpServer = app.getHttpServer();
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin:
        corsOrigins.length > 0
          ? corsOrigins
          : ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    socket.join('reviews');
  });

  globalThis.__socketIO = io;
}
bootstrap();
