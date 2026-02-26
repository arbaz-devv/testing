/**
 * Legacy API controller: file-based store + weak password hashing (SHA256).
 * NOT registered in AppModule. Use AuthController + Prisma modules instead.
 * Do not register this controller in production.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import {
  DataService,
  type ComplaintRecord,
  type ReviewRecord,
  type UserRecord,
  type VoteType,
} from './data.service';

const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_SALT = 'cryptoi-dev-salt';

function hashPassword(password: string): string {
  return createHash('sha256')
    .update(`${PASSWORD_SALT}:${password}`)
    .digest('hex');
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce(
    (acc, rawPart) => {
      const part = rawPart.trim();
      if (!part) return acc;
      const eq = part.indexOf('=');
      if (eq === -1) return acc;
      const key = part.slice(0, eq).trim();
      const value = decodeURIComponent(part.slice(eq + 1));
      if (key) acc[key] = value;
      return acc;
    },
    {} as Record<string, string>,
  );
}

function paginate<T>(items: T[], pageRaw = '1', limitRaw = '10') {
  const page = Math.max(1, Number.parseInt(pageRaw, 10) || 1);
  const limit = Math.max(1, Number.parseInt(limitRaw, 10) || 10);
  const start = (page - 1) * limit;
  const slice = items.slice(start, start + limit);
  return {
    data: slice,
    pagination: {
      page,
      limit,
      total: items.length,
      totalPages: Math.ceil(items.length / limit),
    },
  };
}

@Controller()
export class ApiController {
  constructor(private readonly dataService: DataService) {}

  private async findSessionUser(req: Request): Promise<UserRecord | null> {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) return null;

    const store = await this.dataService.getStore();
    const now = Date.now();
    const session = store.sessions.find(
      (entry) =>
        entry.token === token && new Date(entry.expiresAt).getTime() > now,
    );
    if (!session) return null;

    return store.users.find((u) => u.id === session.userId) ?? null;
  }

  private formatUser(user: UserRecord) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name ?? null,
      avatar: user.avatar ?? null,
      verified: user.verified,
      bio: user.bio ?? null,
      reputation: user.reputation,
    };
  }

  private resolveActorKey(req: Request, userId?: string): string {
    if (userId) return `user:${userId}`;
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) return `session:${token}`;
    return `ip:${req.ip ?? 'unknown'}`;
  }

  private formatReview(
    review: ReviewRecord,
    users: UserRecord[],
    commentsCount: number,
  ) {
    const author = users.find((u) => u.id === review.authorId);
    return {
      id: review.id,
      title: review.title,
      content: review.content,
      overallScore: review.overallScore,
      createdAt: review.createdAt,
      helpfulCount: review.helpfulCount,
      downVoteCount: review.downVoteCount,
      author: author
        ? {
            id: author.id,
            username: author.username,
            avatar: author.avatar,
            verified: author.verified,
          }
        : { username: 'guest' },
      _count: {
        comments: commentsCount,
        helpfulVotes: review.helpfulCount,
      },
    };
  }

  private formatComplaint(
    complaint: ComplaintRecord,
    users: UserRecord[],
    commentsCount: number,
  ) {
    const author = users.find((u) => u.id === complaint.authorId);
    return {
      id: complaint.id,
      title: complaint.title,
      content: complaint.content,
      status: complaint.status,
      createdAt: complaint.createdAt,
      helpfulCount: complaint.helpfulCount,
      downVoteCount: complaint.downVoteCount,
      author: author
        ? {
            id: author.id,
            username: author.username,
            avatar: author.avatar,
            verified: author.verified,
          }
        : { username: 'guest' },
      replies: complaint.replies,
      _count: { comments: commentsCount },
    };
  }

  @Post('auth/register')
  async register(
    @Body()
    body: {
      email?: string;
      username?: string;
      password?: string;
      name?: string;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = (body.email ?? '').trim().toLowerCase();
    const username = (body.username ?? '').trim();
    const password = body.password ?? '';

    if (!email || !username || !password) {
      throw new BadRequestException(
        'Email, username, and password are required',
      );
    }

    const nowIso = new Date().toISOString();
    const user: UserRecord = {
      id: randomUUID(),
      email,
      username,
      passwordHash: hashPassword(password),
      name: body.name?.trim() || undefined,
      verified: false,
      reputation: 0,
      createdAt: nowIso,
    };

    const sessionToken = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    await this.dataService.updateStore((store) => {
      const exists =
        store.users.some((u) => u.email === email) ||
        store.users.some(
          (u) => u.username.toLowerCase() === username.toLowerCase(),
        );
      if (exists) {
        throw new BadRequestException(
          'User with this email or username already exists',
        );
      }
      store.users.push(user);
      store.sessions.push({ token: sessionToken, userId: user.id, expiresAt });
    });

    res.cookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_MS,
    });

    return {
      user: this.formatUser(user),
      message: 'Registered successfully',
    };
  }

  @Post('auth/login')
  async login(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    const store = await this.dataService.getStore();
    const user = store.users.find((u) => u.email === email);
    if (!user || user.passwordHash !== hashPassword(password)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const sessionToken = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await this.dataService.updateStore((next) => {
      next.sessions.push({ token: sessionToken, userId: user.id, expiresAt });
    });

    res.cookie(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TTL_MS,
    });

    return {
      user: this.formatUser(user),
      message: 'Logged in successfully',
    };
  }

  @Post('auth/logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) {
      await this.dataService.updateStore((store) => {
        store.sessions = store.sessions.filter((s) => s.token !== token);
      });
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { message: 'Logged out' };
  }

  @Get('auth/me')
  async me(@Req() req: Request) {
    const user = await this.findSessionUser(req);
    return { user: user ? this.formatUser(user) : null };
  }

  @Get('companies')
  async listCompanies(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    const store = await this.dataService.getStore();
    let items = [...store.companies];
    if (category) {
      items = items.filter(
        (c) => (c.category ?? '').toLowerCase() === category.toLowerCase(),
      );
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q) ||
          (c.description ?? '').toLowerCase().includes(q),
      );
    }
    const { data, pagination } = paginate(items, page, limit);
    return { companies: data, pagination };
  }

  @Get('companies/:slug')
  async getCompanyBySlug(@Param('slug') slug: string) {
    const store = await this.dataService.getStore();
    const company = store.companies.find((c) => c.slug === slug);
    if (!company) {
      throw new BadRequestException('Company not found');
    }
    return company;
  }

  @Get('reviews')
  async listReviews(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('companyId') companyId?: string,
  ) {
    const store = await this.dataService.getStore();
    let items = [...store.reviews].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
    if (companyId) {
      items = items.filter((r) => r.companyId === companyId);
    }

    const formatted = items.map((review) =>
      this.formatReview(
        review,
        store.users,
        store.comments.filter((c) => c.reviewId === review.id).length,
      ),
    );
    const { data, pagination } = paginate(formatted, page, limit);
    return { reviews: data, pagination };
  }

  @Post('reviews')
  async createReview(
    @Req() req: Request,
    @Body()
    body: {
      title?: string;
      content?: string;
      overallScore?: number;
      criteriaScores?: Record<string, number>;
      companyId?: string;
    },
  ) {
    const title = (body.title ?? '').trim();
    const content = (body.content ?? '').trim();
    if (!title || !content) {
      throw new BadRequestException('Title and content are required');
    }

    const me = await this.findSessionUser(req);
    const guestUserId = 'guest-user';
    const review: ReviewRecord = {
      id: randomUUID(),
      title,
      content,
      overallScore: Number(body.overallScore ?? 0),
      criteriaScores: body.criteriaScores ?? {},
      createdAt: new Date().toISOString(),
      authorId: me?.id ?? guestUserId,
      companyId: body.companyId,
      helpfulCount: 0,
      downVoteCount: 0,
      votesByUser: {},
    };

    await this.dataService.updateStore((store) => {
      if (!store.users.some((u) => u.id === guestUserId)) {
        store.users.push({
          id: guestUserId,
          email: 'guest@local',
          username: 'guest',
          passwordHash: '',
          verified: false,
          reputation: 0,
          createdAt: new Date().toISOString(),
        });
      }
      store.reviews.push(review);
    });

    const store = await this.dataService.getStore();
    return this.formatReview(review, store.users, 0);
  }

  @Get('reviews/:id')
  async getReview(@Param('id') id: string) {
    const store = await this.dataService.getStore();
    const review = store.reviews.find((r) => r.id === id);
    if (!review) throw new BadRequestException('Review not found');
    return this.formatReview(
      review,
      store.users,
      store.comments.filter((c) => c.reviewId === review.id).length,
    );
  }

  @Post('reviews/:id/helpful')
  async toggleHelpful(@Req() req: Request, @Param('id') id: string) {
    const actor = this.resolveActorKey(
      req,
      (await this.findSessionUser(req))?.id,
    );
    let helpful = false;
    await this.dataService.updateStore((store) => {
      const review = store.reviews.find((r) => r.id === id);
      if (!review) throw new BadRequestException('Review not found');
      const current = review.votesByUser[actor];
      if (current === 'UP') {
        delete review.votesByUser[actor];
      } else {
        review.votesByUser[actor] = 'UP';
      }
      review.helpfulCount = Object.values(review.votesByUser).filter(
        (v) => v === 'UP',
      ).length;
      review.downVoteCount = Object.values(review.votesByUser).filter(
        (v) => v === 'DOWN',
      ).length;
      helpful = review.votesByUser[actor] === 'UP';
    });

    return { helpful };
  }

  @Post('reviews/:id/vote')
  async voteReview(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('voteType') voteType: VoteType,
  ) {
    const actor = this.resolveActorKey(
      req,
      (await this.findSessionUser(req))?.id,
    );
    let result: {
      voteType: VoteType | null;
      helpfulCount: number;
      downVoteCount: number;
    } = {
      voteType: null,
      helpfulCount: 0,
      downVoteCount: 0,
    };

    await this.dataService.updateStore((store) => {
      const review = store.reviews.find((r) => r.id === id);
      if (!review) throw new BadRequestException('Review not found');
      const current = review.votesByUser[actor];
      if (current === voteType) {
        delete review.votesByUser[actor];
      } else {
        review.votesByUser[actor] = voteType;
      }
      review.helpfulCount = Object.values(review.votesByUser).filter(
        (v) => v === 'UP',
      ).length;
      review.downVoteCount = Object.values(review.votesByUser).filter(
        (v) => v === 'DOWN',
      ).length;
      result = {
        voteType: review.votesByUser[actor] ?? null,
        helpfulCount: review.helpfulCount,
        downVoteCount: review.downVoteCount,
      };
    });
    return result;
  }

  @Get('feed')
  async getFeed(@Query('page') page = '1', @Query('limit') limit = '10') {
    const store = await this.dataService.getStore();
    const reviewItems = store.reviews.map((r) => ({
      id: r.id,
      type: 'review',
      createdAt: r.createdAt,
      title: r.title,
      content: r.content,
    }));
    const complaintItems = store.complaints.map((c) => ({
      id: c.id,
      type: 'complaint',
      createdAt: c.createdAt,
      title: c.title,
      content: c.content,
    }));
    const items = [...reviewItems, ...complaintItems].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
    const { data, pagination } = paginate(items, page, limit);
    return { items: data, pagination };
  }

  @Get('search')
  async search(@Query('q') q = '', @Query('type') type = 'all') {
    const query = q.toLowerCase().trim();
    const store = await this.dataService.getStore();
    const companies = store.companies.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.slug.toLowerCase().includes(query),
    );
    const reviews = store.reviews
      .filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          r.content.toLowerCase().includes(query),
      )
      .map((r) =>
        this.formatReview(
          r,
          store.users,
          store.comments.filter((c) => c.reviewId === r.id).length,
        ),
      );
    const users = store.users
      .filter((u) => u.id !== 'guest-user')
      .filter(
        (u) =>
          u.username.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query),
      )
      .map((u) => this.formatUser(u));

    if (type === 'companies') return { results: { companies } };
    if (type === 'reviews') return { results: { reviews } };
    if (type === 'users') return { results: { users } };
    return { results: { companies, reviews, users } };
  }

  @Get('trending')
  async trending(@Query('limit') limit = '10') {
    const n = Math.max(1, Number.parseInt(limit, 10) || 10);
    const store = await this.dataService.getStore();
    const trending = [...store.reviews]
      .sort((a, b) => b.helpfulCount - a.helpfulCount)
      .slice(0, n)
      .map((r) =>
        this.formatReview(
          r,
          store.users,
          store.comments.filter((c) => c.reviewId === r.id).length,
        ),
      );
    return { trending };
  }

  @Get('complaints')
  async listComplaints(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('username') username?: string,
  ) {
    const store = await this.dataService.getStore();
    let items = [...store.complaints].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
    if (username) {
      const q = username.toLowerCase();
      items = items.filter((c) => {
        const author = store.users.find((u) => u.id === c.authorId);
        return (author?.username ?? '').toLowerCase() === q;
      });
    }

    const formatted = items.map((complaint) =>
      this.formatComplaint(
        complaint,
        store.users,
        store.comments.filter((c) => c.complaintId === complaint.id).length,
      ),
    );
    const { data, pagination } = paginate(formatted, page, limit);
    return { complaints: data, pagination };
  }

  @Post('complaints')
  async createComplaint(
    @Req() req: Request,
    @Body() body: { title?: string; content?: string; companyId?: string },
  ) {
    const title = (body.title ?? '').trim();
    const content = (body.content ?? '').trim();
    if (!title || !content) {
      throw new BadRequestException('Title and content are required');
    }

    const me = await this.findSessionUser(req);
    const guestUserId = 'guest-user';
    const complaint: ComplaintRecord = {
      id: randomUUID(),
      title,
      content,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      authorId: me?.id ?? guestUserId,
      companyId: body.companyId,
      helpfulCount: 0,
      downVoteCount: 0,
      votesByUser: {},
      replies: [],
    };

    await this.dataService.updateStore((store) => {
      if (!store.users.some((u) => u.id === guestUserId)) {
        store.users.push({
          id: guestUserId,
          email: 'guest@local',
          username: 'guest',
          passwordHash: '',
          verified: false,
          reputation: 0,
          createdAt: new Date().toISOString(),
        });
      }
      store.complaints.push(complaint);
    });

    const store = await this.dataService.getStore();
    return this.formatComplaint(complaint, store.users, 0);
  }

  @Get('complaints/:id')
  async getComplaint(@Param('id') id: string) {
    const store = await this.dataService.getStore();
    const complaint = store.complaints.find((c) => c.id === id);
    if (!complaint) throw new BadRequestException('Complaint not found');
    return this.formatComplaint(
      complaint,
      store.users,
      store.comments.filter((c) => c.complaintId === complaint.id).length,
    );
  }

  @Post('complaints/:id/vote')
  async voteComplaint(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('voteType') voteType: VoteType,
  ) {
    const actor = this.resolveActorKey(
      req,
      (await this.findSessionUser(req))?.id,
    );
    let result: {
      voteType: VoteType | null;
      helpfulCount: number;
      downVoteCount: number;
    } = {
      voteType: null,
      helpfulCount: 0,
      downVoteCount: 0,
    };

    await this.dataService.updateStore((store) => {
      const complaint = store.complaints.find((c) => c.id === id);
      if (!complaint) throw new BadRequestException('Complaint not found');
      const current = complaint.votesByUser[actor];
      if (current === voteType) {
        delete complaint.votesByUser[actor];
      } else {
        complaint.votesByUser[actor] = voteType;
      }
      complaint.helpfulCount = Object.values(complaint.votesByUser).filter(
        (v) => v === 'UP',
      ).length;
      complaint.downVoteCount = Object.values(complaint.votesByUser).filter(
        (v) => v === 'DOWN',
      ).length;
      result = {
        voteType: complaint.votesByUser[actor] ?? null,
        helpfulCount: complaint.helpfulCount,
        downVoteCount: complaint.downVoteCount,
      };
    });
    return result;
  }

  @Post('complaints/:id/reply')
  async replyComplaint(
    @Param('id') id: string,
    @Body('content') content?: string,
  ) {
    const safeContent = (content ?? '').trim();
    if (!safeContent)
      throw new BadRequestException('Reply content is required');

    let reply:
      | {
          id: string;
          content: string;
          createdAt: string;
          company: { name: string; logo?: string };
        }
      | undefined;

    await this.dataService.updateStore((store) => {
      const complaint = store.complaints.find((c) => c.id === id);
      if (!complaint) throw new BadRequestException('Complaint not found');
      reply = {
        id: randomUUID(),
        content: safeContent,
        createdAt: new Date().toISOString(),
        company: {
          name: 'Companyprofile',
          logo: '/logo.png',
        },
      };
      complaint.replies.push(reply);
    });

    return reply;
  }

  @Get('comments/list')
  async listComments(
    @Query('reviewId') reviewId?: string,
    @Query('postId') postId?: string,
    @Query('complaintId') complaintId?: string,
  ) {
    const store = await this.dataService.getStore();
    const comments = store.comments
      .filter((comment) => {
        if (reviewId && comment.reviewId !== reviewId) return false;
        if (postId && comment.postId !== postId) return false;
        if (complaintId && comment.complaintId !== complaintId) return false;
        return true;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((comment) => {
        const author = store.users.find((u) => u.id === comment.authorId);
        const repliesCount = store.comments.filter(
          (c) => c.parentId === comment.id,
        ).length;
        return {
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt,
          helpfulCount: comment.helpfulCount,
          downVoteCount: comment.downVoteCount,
          author: author
            ? {
                id: author.id,
                username: author.username,
                avatar: author.avatar,
                verified: author.verified,
              }
            : { username: 'guest' },
          _count: { replies: repliesCount },
        };
      });
    return { comments };
  }

  @Post('comments')
  async createComment(
    @Req() req: Request,
    @Body()
    body: {
      content?: string;
      reviewId?: string;
      postId?: string;
      complaintId?: string;
      parentId?: string;
    },
  ) {
    const safeContent = (body.content ?? '').trim();
    if (!safeContent)
      throw new BadRequestException('Comment content is required');
    const me = await this.findSessionUser(req);
    const guestUserId = 'guest-user';

    const comment = {
      id: randomUUID(),
      content: safeContent,
      createdAt: new Date().toISOString(),
      authorId: me?.id ?? guestUserId,
      reviewId: body.reviewId,
      postId: body.postId,
      complaintId: body.complaintId,
      parentId: body.parentId,
      helpfulCount: 0,
      downVoteCount: 0,
      votesByUser: {},
    };

    await this.dataService.updateStore((store) => {
      if (!store.users.some((u) => u.id === guestUserId)) {
        store.users.push({
          id: guestUserId,
          email: 'guest@local',
          username: 'guest',
          passwordHash: '',
          verified: false,
          reputation: 0,
          createdAt: new Date().toISOString(),
        });
      }
      store.comments.push(comment);
    });

    const store = await this.dataService.getStore();
    const author = store.users.find((u) => u.id === comment.authorId);
    return {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      helpfulCount: comment.helpfulCount,
      downVoteCount: comment.downVoteCount,
      author: author
        ? {
            id: author.id,
            username: author.username,
            avatar: author.avatar,
            verified: author.verified,
          }
        : { username: 'guest' },
      _count: { replies: 0 },
    };
  }

  @Post('comments/:id/vote')
  async voteComment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('voteType') voteType: VoteType,
  ) {
    const actor = this.resolveActorKey(
      req,
      (await this.findSessionUser(req))?.id,
    );
    let result: {
      voteType: VoteType | null;
      helpfulCount: number;
      downVoteCount: number;
    } = {
      voteType: null,
      helpfulCount: 0,
      downVoteCount: 0,
    };

    await this.dataService.updateStore((store) => {
      const comment = store.comments.find((c) => c.id === id);
      if (!comment) throw new BadRequestException('Comment not found');
      const current = comment.votesByUser[actor];
      if (current === voteType) {
        delete comment.votesByUser[actor];
      } else {
        comment.votesByUser[actor] = voteType;
      }
      comment.helpfulCount = Object.values(comment.votesByUser).filter(
        (v) => v === 'UP',
      ).length;
      comment.downVoteCount = Object.values(comment.votesByUser).filter(
        (v) => v === 'DOWN',
      ).length;
      result = {
        voteType: comment.votesByUser[actor] ?? null,
        helpfulCount: comment.helpfulCount,
        downVoteCount: comment.downVoteCount,
      };
    });
    return result;
  }
}
