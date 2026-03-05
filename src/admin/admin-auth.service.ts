import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '../config/config.service';
import { ADMIN_JWT_TYPE } from './admin.guard';

@Injectable()
export class AdminAuthService {
  constructor(private readonly config: ConfigService) {}

  isLoginEnabled(): boolean {
    const email = this.config.adminEmail;
    const hash = this.config.adminPasswordHash;
    return !!email?.trim() && !!hash?.trim();
  }

  async login(email: string, password: string): Promise<{ token: string; expiresIn: number }> {
    if (!this.isLoginEnabled()) {
      throw new UnauthorizedException('Admin login is not configured');
    }
    const adminEmail = this.config.adminEmail!.trim();
    if (email.trim().toLowerCase() !== adminEmail.toLowerCase()) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const hash = this.config.adminPasswordHash!;
    const valid = await bcrypt.compare(password, hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const expiresIn = 24 * 60 * 60; // 24 hours in seconds
    const token = jwt.sign(
      {
        type: ADMIN_JWT_TYPE,
        email: adminEmail,
        sub: adminEmail,
      },
      this.config.jwtSecret,
      { expiresIn },
    );
    return { token, expiresIn };
  }
}
