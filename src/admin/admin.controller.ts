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
  PageLimitDto,
  ReviewStatusQueryDto,
  UpdateReviewStatusDto,
  ReviewsQueryDto,
  UsersQueryDto,
} from './dto';
import { ReviewStatus } from '@prisma/client';

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
  async userDetail(@Param('id') id: string) {
    return this.admin.getUserDetail(id);
  }

  @Get('reviews')
  async reviews(@Query() query: ReviewsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    return this.admin.getReviews({
      page,
      limit,
      status: query.status,
      q: query.q,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get('reviews/:id')
  async getReview(@Param('id') id: string) {
    return this.admin.getReview(id);
  }

  @Patch('reviews/:id')
  async updateReviewStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    const status = dto.status.toUpperCase() as ReviewStatus;
    return this.admin.updateReviewStatus(id, status);
  }

  @Get('ratings')
  async ratings(@Query() query: PageLimitDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    return this.admin.getRatings({ page, limit });
  }
}
