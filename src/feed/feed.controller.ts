import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { FeedService } from './feed.service';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { SessionUser } from '../auth/auth.service';

const FEED_LIMIT_MAX = 50;

@Controller('api/feed')
@UseGuards(OptionalAuthGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  getFeed(
    @Req() req: Request & { user?: SessionUser | null },
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('category') category?: string,
  ) {
    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 20;
    const safePage = Math.max(1, parsedPage);
    const safeLimit = Math.min(FEED_LIMIT_MAX, Math.max(1, parsedLimit));

    return this.feedService.getFeed(
      safePage,
      safeLimit,
      category,
      req.user ?? null,
    );
  }
}
