import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService, SessionUser } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.authService.getSessionTokenFromRequest(request);
    const user = await this.authService.getSessionFromToken(token);

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    (request as Request & { user: SessionUser }).user = user;
    return true;
  }
}
