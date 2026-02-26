import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string, type: string, limit: number) {
    if (!query) {
      return { results: {} };
    }

    const results: Record<string, unknown> = {};

    if (type === 'all' || type === 'companies') {
      results.companies = await this.prisma.company.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          category: true,
        },
      });
    }

    if (type === 'all' || type === 'reviews') {
      results.reviews = await this.prisma.review.findMany({
        where: {
          status: 'APPROVED',
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });
    }

    if (type === 'all' || type === 'users') {
      results.users = await this.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: limit,
        select: {
          id: true,
          username: true,
          name: true,
          avatar: true,
          verified: true,
        },
      });
    }

    return { results };
  }
}
