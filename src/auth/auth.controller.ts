import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ZodError } from 'zod';
import { AuthService } from './auth.service';
import { loginSchema, registerSchema } from '../common/utils';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private sessionCookieOptions() {
    const corsOrigin = process.env.CORS_ORIGIN ?? '';
    const isLocalDevOrigin =
      corsOrigin.includes('http://localhost') ||
      corsOrigin.includes('http://127.0.0.1');
    const isProduction = process.env.NODE_ENV === 'production';
    // Cross-origin (e.g. Vercel → Railway): browser only sends cookie if SameSite=None; Secure
    const sameSite = isProduction && !isLocalDevOrigin ? 'none' : 'lax';
    return {
      httpOnly: true,
      sameSite: sameSite as 'lax' | 'none',
      secure: isProduction && !isLocalDevOrigin ? true : isProduction,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const token = this.authService.getSessionTokenFromRequest(req);
    const user = await this.authService.getSessionFromToken(token);
    return { user };
  }

  @Throttle({
    short: { limit: 5, ttl: 60_000 },
    long: { limit: 5, ttl: 60_000 },
  })
  @Post('register')
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    let parsed: {
      email: string;
      username: string;
      password: string;
      name?: string;
    };
    try {
      const raw =
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>)
          : {};
      parsed = registerSchema.parse({
        email: raw.email ?? '',
        username: raw.username ?? '',
        password: raw.password ?? '',
        name: raw.name,
      }) as {
        email: string;
        username: string;
        password: string;
        name?: string;
      };
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        throw new BadRequestException(first?.message ?? 'Validation failed');
      }
      throw err;
    }

    const email = parsed.email.trim().toLowerCase();
    const username = parsed.username.trim();
    const password = parsed.password;
    const name = parsed.name?.trim() || null;

    const existing = await this.authService.findUserByEmailOrUsername(
      email,
      username,
    );

    if (existing?.email === email) {
      throw new ConflictException('Email is already registered');
    }
    if (existing?.username === username) {
      throw new ConflictException('Username is already taken');
    }

    const passwordHash = await this.authService.hashPassword(password);
    const user = await this.authService.createUser({
      email,
      username,
      passwordHash,
      ...(name ? { name } : {}),
    });

    const token = await this.authService.createSession(user.id);
    res.cookie('session', token, this.sessionCookieOptions());

    return {
      user,
      message: 'Registration successful',
    };
  }

  @Throttle({
    short: { limit: 5, ttl: 60_000 },
    long: { limit: 5, ttl: 60_000 },
  })
  @Post('login')
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    let parsed: { email: string; password: string };
    try {
      const raw =
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>)
          : {};
      parsed = loginSchema.parse({
        email: raw.email ?? '',
        password: raw.password ?? '',
      }) as {
        email: string;
        password: string;
      };
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        throw new BadRequestException(first?.message ?? 'Validation failed');
      }
      throw err;
    }

    const email = parsed.email.trim().toLowerCase();
    const password = parsed.password;

    const user = await this.authService.findUserByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.authService.comparePassword(
      password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = await this.authService.createSession(user.id);
    res.cookie('session', token, this.sessionCookieOptions());

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        name: user.name ?? null,
        avatar: user.avatar ?? null,
        verified: user.verified,
        reputation: user.reputation,
      },
      message: 'Login successful',
    };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.authService.getSessionTokenFromRequest(req);
    if (token) {
      await this.authService.deleteSession(token);
    }
    const opts = this.sessionCookieOptions();
    res.clearCookie('session', {
      path: '/',
      httpOnly: opts.httpOnly,
      sameSite: opts.sameSite,
      secure: opts.secure,
    });
    return { message: 'Logout successful' };
  }
}
