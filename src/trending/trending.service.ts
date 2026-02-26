import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrendingService {
  constructor(private readonly prisma: PrismaService) {}

  async getTrending(period: string, limit: number) {
    const daysAgo = period === 'month' ? 30 : 7;
    const weekThreshold = new Date();
    weekThreshold.setDate(weekThreshold.getDate() - daysAgo);

    const trendingReviews = await this.prisma.review.findMany({
      where: {
        status: 'APPROVED',
      },
      select: {
        id: true,
        title: true,
        content: true,
        overallScore: true,
        helpfulCount: true,
        createdAt: true,
      },
      orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    const topRatedReviews = await this.prisma.review.findMany({
      where: {
        status: 'APPROVED',
        createdAt: { gte: weekThreshold },
      },
      select: {
        id: true,
        title: true,
        content: true,
        overallScore: true,
        helpfulCount: true,
        createdAt: true,
      },
      orderBy: [{ overallScore: 'desc' }, { helpfulCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    const mapReviewCard = (review: {
      id: string;
      title: string;
      content: string;
      overallScore: number;
      helpfulCount: number;
    }) => ({
      id: review.id,
      name: review.title,
      description: review.content,
      likes: review.helpfulCount ?? 0,
      averageScore: review.overallScore ?? 0,
      reviewCount: 1,
    });

    const trendingNow = trendingReviews.map(mapReviewCard);
    const topRatedThisWeek = topRatedReviews.map(mapReviewCard);

    return { trendingNow, topRatedThisWeek };
  }
}
