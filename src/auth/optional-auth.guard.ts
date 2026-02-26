import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthService, SessionUser } from './auth.service';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.authService.getSessionTokenFromRequest(request);
    const user = await this.authService.getSessionFromToken(token);
    (request as Request & { user?: SessionUser | null }).user = user ?? null;
    return true;
  }
}
