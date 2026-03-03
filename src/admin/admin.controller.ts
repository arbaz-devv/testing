import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewStatus } from '@prisma/client';

function getAdminKey(req: Request): string | null {
  const key = process.env.ANALYTICS_API_KEY || process.env.ADMIN_API_KEY;
  if (!key?.trim()) return null;
  const headerKey = typeof req.headers?.['x-admin-key'] === 'string'
    ? req.headers['x-admin-key']
    : Array.isArray(req.headers?.['x-admin-key']) ? req.headers['x-admin-key'][0] : undefined;
  const queryKey = typeof (req as Request & { query?: { key?: string } }).query?.key === 'string'
    ? (req as Request & { query?: { key?: string } }).query?.key
    : undefined;
  const provided = headerKey || queryKey;
  return provided === key ? key : null;
}

function requireAdmin(req: Request) {
  const key = process.env.ANALYTICS_API_KEY || process.env.ADMIN_API_KEY;
  if (!key?.trim()) return;
  if (!getAdminKey(req)) {
    throw new UnauthorizedException('Admin API key required');
  }
}

@Controller('api/admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  async stats(@Req() req: Request) {
    requireAdmin(req);
    const [totalUsers, pendingReviews, flaggedContent, totalReviews, productsCount, newUsersThisWeek] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.review.count({ where: { status: 'PENDING' } }),
      this.prisma.review.count({ where: { status: 'FLAGGED' } }),
      this.prisma.review.count(),
      this.prisma.product.count(),
      this.prisma.user.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    return {
      totalUsers,
      activeToday: 0,
      pendingReviews,
      flaggedContent,
      totalRatings: productsCount,
      newThisWeek: newUsersThisWeek,
      totalReviews,
      openComplaints: await this.prisma.complaint.count({ where: { status: 'OPEN' } }),
    };
  }

  @Get('users')
  async users(
    @Req() req: Request,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    requireAdmin(req);
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip: (p - 1) * l,
        take: l,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          avatar: true,
          role: true,
          createdAt: true,
          _count: { select: { reviews: true } },
        },
      }),
      this.prisma.user.count(),
    ]);
    const list = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name ?? u.username,
      username: u.username,
      role: u.role.toLowerCase(),
      status: 'active',
      joinedAt: u.createdAt.toISOString().slice(0, 10),
      reviewCount: u._count.reviews,
      lastActive: '-',
    }));
    return {
      users: list,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    };
  }

  @Get('reviews')
  async reviews(
    @Req() req: Request,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
  ) {
    requireAdmin(req);
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const statusFilter = status && ['PENDING', 'APPROVED', 'REJECTED', 'FLAGGED'].includes(status.toUpperCase())
      ? (status.toUpperCase() as ReviewStatus)
      : undefined;
    const where = statusFilter ? { status: statusFilter } : {};
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip: (p - 1) * l,
        take: l,
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, username: true, name: true } },
          product: { select: { id: true, name: true, slug: true } },
          company: { select: { id: true, name: true, slug: true } },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    const list = reviews.map((r) => ({
      id: r.id,
      title: r.title,
      excerpt: r.content.slice(0, 120) + (r.content.length > 120 ? '...' : ''),
      body: r.content,
      author: r.author?.name ?? r.author?.username ?? 'Unknown',
      authorId: r.authorId,
      productName: r.product?.name ?? r.company?.name ?? '-',
      productId: r.productId,
      companyId: r.companyId,
      score: r.overallScore,
      helpfulCount: r.helpfulCount,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      commentCount: r._count.comments,
    }));
    return {
      reviews: list,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    };
  }

  @Patch('reviews/:id')
  async updateReviewStatus(
    @Param('id') id: string,
    @Body() body: { status?: string },
    @Req() req: Request,
  ) {
    requireAdmin(req);
    const status = body?.status?.toUpperCase();
    if (!status || !['PENDING', 'APPROVED', 'REJECTED', 'FLAGGED'].includes(status)) {
      return { ok: false, error: 'Invalid status. Use APPROVED, REJECTED, PENDING, or FLAGGED' };
    }
    const review = await this.prisma.review.update({
      where: { id },
      data: { status: status as ReviewStatus },
    }).catch(() => null);
    if (!review) return { ok: false, error: 'Review not found' };
    return { ok: true, review: { id: review.id, status: review.status } };
  }

  @Get('ratings')
  async ratings(
    @Req() req: Request,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    requireAdmin(req);
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const products = await this.prisma.product.findMany({
      skip: (p - 1) * l,
      take: l,
      orderBy: { name: 'asc' },
      include: {
        company: { select: { name: true } },
        _count: { select: { reviews: true } },
        reviews: {
          select: { overallScore: true, status: true, createdAt: true },
        },
      },
    });
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const list = products.map((prod) => {
      const approved = prod.reviews.filter((r) => r.status === 'APPROVED');
      const avgScore = approved.length
        ? approved.reduce((s, r) => s + r.overallScore, 0) / approved.length
        : 0;
      const newThisWeek = prod.reviews.filter((r) => new Date(r.createdAt) >= oneWeekAgo).length;
      const lastReview = prod.reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      return {
        id: prod.id,
        productName: prod.name,
        slug: prod.slug,
        category: prod.category,
        score: Math.round(avgScore * 10) / 10,
        reviewCount: prod._count.reviews,
        submittedBy: prod.company?.name ?? '-',
        updatedAt: lastReview ? new Date(lastReview.createdAt).toISOString().slice(0, 10) : '-',
        status: approved.length > 0 ? 'published' : 'pending',
        trend: newThisWeek > 0 ? 'up' as const : 'stable' as const,
      };
    });
    const total = await this.prisma.product.count();
    return {
      ratings: list,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    };
  }
}
