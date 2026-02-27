import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeed(page: number, limit: number, category?: string) {
    const reviewWhere: Record<string, unknown> = {
      status: 'APPROVED',
      ...(category && { company: { category } }),
    };

    const complaintWhere: Record<string, unknown> = {
      ...(category && { company: { category } }),
    };

    const fetchReviewChunk = (skip: number) =>
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
        skip,
        take: limit,
      });

    const fetchComplaintChunk = (skip: number) =>
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
        skip,
        take: limit,
      });

    // Fetch total counts for correct pagination.
    const [totalReviews, totalComplaints] = await Promise.all([
      this.prisma.review.count({ where: reviewWhere }),
      this.prisma.complaint.count({ where: complaintWhere }),
    ]);

    const total = totalReviews + totalComplaints;
    if (total === 0) {
      return {
        items: [],
        pagination: {
          page,
          limit,
          total,
          totalPages: 0,
        },
      };
    }

    const targetCount = page * limit;
    let reviewSkip = 0;
    let complaintSkip = 0;
    let reviewBuffer = (await fetchReviewChunk(reviewSkip)).map((review) => ({
      ...review,
      type: 'review' as const,
    }));
    let complaintBuffer = (await fetchComplaintChunk(complaintSkip)).map(
      (complaint) => ({ ...complaint, type: 'complaint' as const }),
    );
    reviewSkip += reviewBuffer.length;
    complaintSkip += complaintBuffer.length;

    const merged: Array<
      (typeof reviewBuffer)[number] | (typeof complaintBuffer)[number]
    > = [];

    while (merged.length < targetCount) {
      if (reviewBuffer.length === 0 && complaintBuffer.length === 0) {
        break;
      }

      if (reviewBuffer.length === 0) {
        reviewBuffer = (await fetchReviewChunk(reviewSkip)).map((review) => ({
          ...review,
          type: 'review' as const,
        }));
        reviewSkip += reviewBuffer.length;
      }

      if (complaintBuffer.length === 0) {
        complaintBuffer = (await fetchComplaintChunk(complaintSkip)).map(
          (complaint) => ({
            ...complaint,
            type: 'complaint' as const,
          }),
        );
        complaintSkip += complaintBuffer.length;
      }

      if (reviewBuffer.length === 0 && complaintBuffer.length === 0) {
        break;
      }

      const nextReview = reviewBuffer[0];
      const nextComplaint = complaintBuffer[0];

      if (
        nextReview &&
        (!nextComplaint || nextReview.createdAt > nextComplaint.createdAt)
      ) {
        merged.push(nextReview);
        reviewBuffer.shift();
      } else if (nextComplaint) {
        merged.push(nextComplaint);
        complaintBuffer.shift();
      }
    }

    const items = merged.slice((page - 1) * limit, page * limit);

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
