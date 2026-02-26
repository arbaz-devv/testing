/**
 * Legacy file-based store. Not used by AppModule; Prisma + PostgreSQL are the source of truth.
 * Do not use in production. Kept only for reference/migration.
 */
import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type VoteType = 'UP' | 'DOWN';

export interface UserRecord {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  name?: string;
  avatar?: string;
  verified: boolean;
  bio?: string;
  reputation: number;
  createdAt: string;
}

interface SessionRecord {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface CompanyRecord {
  id: string;
  slug: string;
  name: string;
  category?: string;
  logo?: string;
  description?: string;
}

export interface ReviewRecord {
  id: string;
  title: string;
  content: string;
  overallScore: number;
  criteriaScores: Record<string, number>;
  createdAt: string;
  authorId: string;
  companyId?: string;
  helpfulCount: number;
  downVoteCount: number;
  votesByUser: Record<string, VoteType>;
}

export interface ComplaintRecord {
  id: string;
  title: string;
  content: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  authorId: string;
  companyId?: string;
  helpfulCount: number;
  downVoteCount: number;
  votesByUser: Record<string, VoteType>;
  replies: Array<{
    id: string;
    content: string;
    createdAt: string;
    company: { name: string; logo?: string };
  }>;
}

export interface CommentRecord {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  reviewId?: string;
  postId?: string;
  complaintId?: string;
  parentId?: string;
  helpfulCount: number;
  downVoteCount: number;
  votesByUser: Record<string, VoteType>;
}

interface StoreShape {
  users: UserRecord[];
  sessions: SessionRecord[];
  companies: CompanyRecord[];
  reviews: ReviewRecord[];
  complaints: ComplaintRecord[];
  comments: CommentRecord[];
}

@Injectable()
export class DataService {
  private readonly storePath = resolve(process.cwd(), '.data', 'store.json');
  private cache: StoreShape | null = null;
  private writeLock: Promise<void> = Promise.resolve();

  private async loadStore(): Promise<StoreShape> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await readFile(this.storePath, 'utf8');
      this.cache = JSON.parse(raw) as StoreShape;
      return this.cache;
    } catch {
      const initial = this.createInitialStore();
      await this.persist(initial);
      this.cache = initial;
      return initial;
    }
  }

  private createInitialStore(): StoreShape {
    return {
      users: [],
      sessions: [],
      companies: [
        {
          id: randomUUID(),
          slug: 'companyprofile',
          name: 'Companyprofile',
          category: 'EXCHANGES',
          description: 'Default company used by dev backend.',
          logo: '/logo.png',
        },
      ],
      reviews: [],
      complaints: [],
      comments: [],
    };
  }

  private async persist(data: StoreShape): Promise<void> {
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(data, null, 2), 'utf8');
  }

  async updateStore(
    updater: (data: StoreShape) => void | Promise<void>,
  ): Promise<StoreShape> {
    this.writeLock = this.writeLock.then(async () => {
      const data = await this.loadStore();
      await updater(data);
      await this.persist(data);
    });
    await this.writeLock;
    return await this.loadStore();
  }

  async getStore(): Promise<StoreShape> {
    return this.loadStore();
  }
}
