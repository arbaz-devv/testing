import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../auth/auth.service';

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeed(
    page: number,
    limit: number,
    category?: string,
    user?: SessionUser | null,
  ) {
    const reviewWhere: Record<string, unknown> = {
      status: 'APPROVED',
      ...(category && { company: { category } }),
    };

    const complaintWhere: Record<string, unknown> = {
      ...(category && { company: { category } }),
    };

    // Fetch total counts for correct pagination
    const [totalReviews, totalComplaints, reviews, complaints] =
      await Promise.all([
        this.prisma.review.count({ where: reviewWhere }),
        this.prisma.complaint.count({ where: complaintWhere }),
        this.prisma.review.findMany({
          where: reviewWhere,
          select: {
            id: true,
            title: true,
            content: true,
            overallScore: true,
            helpfulCount: true,
            downVoteCount: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                username: true,
                avatar: true,
                verified: true,
                reputation: true,
              },
            },
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
                logo: true,
              },
            },
            _count: {
              select: {
                helpfulVotes: true,
                comments: true,
                reactions: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: page * limit + limit,
        }),
        this.prisma.complaint.findMany({
          where: complaintWhere,
          select: {
            id: true,
            title: true,
            content: true,
            status: true,
            helpfulCount: true,
            downVoteCount: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                username: true,
                avatar: true,
                verified: true,
                reputation: true,
              },
            },
            company: {
              select: {
                id: true,
                name: true,
                slug: true,
                logo: true,
              },
            },
            _count: {
              select: {
                comments: true,
                reactions: true,
                votes: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: page * limit + limit,
        }),
      ]);

    const items = [
      ...reviews.map((r) => ({ ...r, type: 'review' as const })),
      ...complaints.map((c) => ({ ...c, type: 'complaint' as const })),
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice((page - 1) * limit, page * limit);

    const total = totalReviews + totalComplaints;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
