import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import {
  AdminLazyQueryDto,
  PageLimitDto,
  ReviewStatusQueryDto,
  UpdateReviewStatusDto,
  ReviewsQueryDto,
  UsersQueryDto,
} from './dto';

@Controller('api/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  async stats() {
    return this.admin.getStats();
  }

  @Get('users')
  async users(@Query() query: UsersQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    return this.admin.getUsers({
      page,
      limit,
      q: query.q,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get('users/:id')
  async userDetail(@Param('id') id: string, @Query() query: AdminLazyQueryDto) {
    return this.admin.getUserDetail(id, query.lazy ?? false);
  }

  @Get('reviews')
  async reviews(@Query() query: ReviewsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    return this.admin.getReviews({
      page,
      limit,
      includeTotal: query.includeTotal ?? true,
      status: query.status,
      q: query.q,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get('reviews/:id')
  async getReview(@Param('id') id: string, @Query() query: AdminLazyQueryDto) {
    return this.admin.getReview(id, query.lazy ?? false);
  }

  @Patch('reviews/:id')
  async updateReviewStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.admin.updateReviewStatus(id, dto.status);
  }

  @Get('ratings')
  async ratings(@Query() query: PageLimitDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    return this.admin.getRatings({ page, limit });
  }
}
