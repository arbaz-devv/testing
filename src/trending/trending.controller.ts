import { Controller, Get, Query } from '@nestjs/common';
import { TrendingService } from './trending.service';

const TRENDING_LIMIT_MAX = 20;

@Controller('api/trending')
export class TrendingController {
  constructor(private readonly trendingService: TrendingService) {}

  @Get()
  getTrending(@Query('period') period = 'week', @Query('limit') limit = '10') {
    const parsedLimit = parseInt(limit, 10) || 10;
    const safeLimit = Math.min(TRENDING_LIMIT_MAX, Math.max(1, parsedLimit));
    return this.trendingService.getTrending(period, safeLimit);
  }
}
