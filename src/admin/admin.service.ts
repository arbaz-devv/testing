import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private startOfToday(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  async getStats() {
    const startOfToday = this.startOfToday();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalUsers,
      activeToday,
      pendingReviews,
      flaggedContent,
      totalReviews,
      productsCount,
      newUsersThisWeek,
      openComplaints,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.session.findMany({ where: { createdAt: { gte: startOfToday } }, select: { userId: true } }).then((sessions) => {
        const distinct = new Set(sessions.map((s) => s.userId));
        return distinct.size;
      }),
      this.prisma.review.count({ where: { status: 'PENDING' } }),
      this.prisma.review.count({ where: { status: 'FLAGGED' } }),
      this.prisma.review.count(),
      this.prisma.product.count(),
      this.prisma.user.count({
        where: { createdAt: { gte: oneWeekAgo } },
      }),
      this.prisma.complaint.count({ where: { status: 'OPEN' } }),
    ]);
    return {
      totalUsers,
      activeToday,
      pendingReviews,
      flaggedContent,
      totalRatings: productsCount,
      newThisWeek: newUsersThisWeek,
      totalReviews,
      openComplaints,
      newFeedbacks: 0,
    };
  }

  async getUsers(params: {
    page: number;
    limit: number;
    q?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const p = Math.max(1, params.page);
    const l = Math.min(100, Math.max(1, params.limit));
    const where: { createdAt?: { gte?: Date; lte?: Date }; OR?: Array<{ email?: { contains: string; mode: 'insensitive' }; name?: { contains: string; mode: 'insensitive' }; username?: { contains: string; mode: 'insensitive' } }> } = {};
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom);
      if (params.dateTo) {
        const to = new Date(params.dateTo);
        to.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
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
      this.prisma.user.count({ where }),
    ]);
    const list = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name ?? u.username,
      username: u.username,
      role: u.role.toLowerCase(),
      status: 'active' as const,
      joinedAt: u.createdAt.toISOString().slice(0, 10),
      reviewCount: u._count.reviews,
      lastActive: '-',
    }));
    return {
      users: list,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    };
  }

  async getUserDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { reviews: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const [
      commentsCount,
      helpfulVotesCount,
      complaintVotesCount,
      commentVotesCount,
      reviews,
      complaints,
      posts,
      sessions,
      comments,
      helpfulVotes,
    ] = await Promise.all([
      this.prisma.comment.count({ where: { authorId: id } }),
      this.prisma.helpfulVote.count({ where: { userId: id } }),
      this.prisma.complaintVote.count({ where: { userId: id } }),
      this.prisma.commentVote.count({ where: { userId: id } }),
      this.prisma.review.findMany({
        where: { authorId: id },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { name: true } },
          company: { select: { name: true } },
        },
      }),
      this.prisma.complaint.findMany({
        where: { authorId: id },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { name: true } },
          company: { select: { name: true } },
        },
      }),
      this.prisma.post.findMany({
        where: { authorId: id },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { comments: true } } },
      }),
      this.prisma.session.findMany({
        where: { userId: id },
        select: { createdAt: true },
      }),
      this.prisma.comment.findMany({
        where: { authorId: id },
        select: { createdAt: true },
      }),
      this.prisma.helpfulVote.findMany({
        where: { userId: id },
        select: { createdAt: true },
      }),
    ]);

    const dayKeys = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - idx));
      return d.toISOString().slice(0, 10);
    });
    const seriesMap: Record<string, { logins: number; comments: number; votes: number }> = {};
    dayKeys.forEach((key) => {
      seriesMap[key] = { logins: 0, comments: 0, votes: 0 };
    });
    sessions.forEach((s) => {
      const key = s.createdAt.toISOString().slice(0, 10);
      if (seriesMap[key]) seriesMap[key].logins += 1;
    });
    comments.forEach((c) => {
      const key = c.createdAt.toISOString().slice(0, 10);
      if (seriesMap[key]) seriesMap[key].comments += 1;
    });
    helpfulVotes.forEach((v) => {
      const key = v.createdAt.toISOString().slice(0, 10);
      if (seriesMap[key]) seriesMap[key].votes += 1;
    });

    const lastActivityDate = [
      user.updatedAt,
      ...reviews.map((r) => r.createdAt),
      ...complaints.map((c) => c.createdAt),
      ...posts.map((p) => p.createdAt),
    ].reduce((max, current) => (current > max ? current : max), user.createdAt);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name ?? user.username,
        role: user.role.toLowerCase(),
        status: 'active',
        joinedAt: user.createdAt.toISOString().slice(0, 10),
        reviewCount: user._count.reviews,
        lastActive: lastActivityDate.toISOString().slice(0, 10),
        lastLoginAt:
          sessions.length > 0
            ? sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0].createdAt.toISOString()
            : undefined,
      },
      metrics: {
        commentsCount,
        votesCount: helpfulVotesCount + complaintVotesCount + commentVotesCount,
      },
      activitySeries: dayKeys.map((date) => ({
        date,
        device: 'Unknown',
        country: 'Unknown',
        logins: seriesMap[date].logins,
        comments: seriesMap[date].comments,
        votes: seriesMap[date].votes,
      })),
      reviews: reviews.map((r) => ({
        id: r.id,
        title: r.title,
        productName: r.product?.name ?? r.company?.name ?? '-',
        score: r.overallScore,
        status: r.status.toLowerCase(),
        createdAt: r.createdAt.toISOString(),
      })),
      complaints: complaints.map((c) => ({
        id: c.id,
        subject: c.title,
        relatedTo: c.product ? 'product' : c.company ? 'company' : 'general',
        priority: c.reportCount >= 10 ? 'high' : c.reportCount >= 3 ? 'medium' : 'low',
        status: c.status.toLowerCase() === 'closed' ? 'dismissed' : c.status.toLowerCase(),
        createdAt: c.createdAt.toISOString(),
      })),
      discussions: posts.map((p) => ({
        id: p.id,
        title: p.content.slice(0, 72) + (p.content.length > 72 ? '...' : ''),
        category: 'Post',
        commentCount: p._count.comments,
        status: 'open',
        createdAt: p.createdAt.toISOString(),
      })),
      feedbacks: [],
    };
  }

  async getReviews(params: {
    page: number;
    limit: number;
    status?: string;
    q?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const p = Math.max(1, params.page);
    const l = Math.min(100, Math.max(1, params.limit));
    const statusFilter =
      params.status && ['PENDING', 'APPROVED', 'REJECTED', 'FLAGGED'].includes(params.status.toUpperCase())
        ? (params.status.toUpperCase() as ReviewStatus)
        : undefined;
    const where: Prisma.ReviewWhereInput = {};
    if (statusFilter) where.status = statusFilter;
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom);
      if (params.dateTo) {
        const to = new Date(params.dateTo);
        to.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
        { author: { name: { contains: q, mode: 'insensitive' } } },
        { author: { username: { contains: q, mode: 'insensitive' } } },
        { product: { name: { contains: q, mode: 'insensitive' } } },
        { company: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
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

  async getReview(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, username: true, name: true } },
        product: { select: { id: true, name: true, slug: true } },
        company: { select: { id: true, name: true, slug: true } },
        _count: { select: { comments: true } },
        reactions: { select: { type: true } },
        helpfulVotes: { select: { userId: true, voteType: true, createdAt: true } },
        comments: {
          where: { parentId: null },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, username: true, name: true } },
            replies: {
              orderBy: { createdAt: 'asc' },
              include: {
                author: { select: { id: true, username: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!review) throw new NotFoundException('Review not found');

    const reactionCounts = (review.reactions as { type: string }[]).reduce(
      (acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const mapComment = (c: {
      id: string;
      content: string;
      authorId: string;
      author: { id: string; name: string | null; username: string | null };
      helpfulCount: number;
      downVoteCount: number;
      createdAt: Date;
      replies?: Array<{
        id: string;
        content: string;
        authorId: string;
        author: { id: string; name: string | null; username: string | null };
        helpfulCount: number;
        downVoteCount: number;
        createdAt: Date;
      }>;
    }) => ({
      id: c.id,
      content: c.content,
      authorId: c.authorId,
      author: c.author?.name ?? c.author?.username ?? 'Unknown',
      helpfulCount: c.helpfulCount,
      downVoteCount: c.downVoteCount,
      createdAt: c.createdAt.toISOString(),
      replyCount: c.replies?.length ?? 0,
      replies: (c.replies ?? []).map((r) => ({
        id: r.id,
        content: r.content,
        authorId: r.authorId,
        author: r.author?.name ?? r.author?.username ?? 'Unknown',
        helpfulCount: r.helpfulCount,
        downVoteCount: r.downVoteCount,
        createdAt: r.createdAt.toISOString(),
      })),
    });

    return {
      id: review.id,
      title: review.title,
      excerpt: review.content.slice(0, 120) + (review.content.length > 120 ? '...' : ''),
      body: review.content,
      author: review.author?.name ?? review.author?.username ?? 'Unknown',
      authorId: review.authorId,
      productName: review.product?.name ?? review.company?.name ?? '-',
      productId: review.productId,
      companyId: review.companyId,
      score: review.overallScore,
      helpfulCount: review.helpfulCount,
      downVoteCount: review.downVoteCount,
      reportCount: review.reportCount,
      status: review.status,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      commentCount: review._count.comments,
      reactions: reactionCounts,
      helpfulVotes: review.helpfulVotes.map((v) => ({
        userId: v.userId,
        voteType: v.voteType,
        createdAt: v.createdAt.toISOString(),
      })),
      comments: review.comments.map(mapComment),
    };
  }

  async updateReviewStatus(id: string, status: ReviewStatus) {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found');
    const review = await this.prisma.review.update({
      where: { id },
      data: { status },
    });
    return { ok: true, review: { id: review.id, status: review.status } };
  }

  async getRatings(params: { page: number; limit: number }) {
    const p = Math.max(1, params.page);
    const l = Math.min(100, Math.max(1, params.limit));
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
      const avgScore =
        approved.length
          ? approved.reduce((s, r) => s + r.overallScore, 0) / approved.length
          : 0;
      const newThisWeek = prod.reviews.filter((r) => new Date(r.createdAt) >= oneWeekAgo).length;
      const lastReview = prod.reviews.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
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
        trend: (newThisWeek > 0 ? 'up' : 'stable') as 'up' | 'stable',
      };
    });
    const total = await this.prisma.product.count();
    return {
      ratings: list,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
    };
  }
}
