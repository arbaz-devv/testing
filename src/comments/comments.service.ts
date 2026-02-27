import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/errors';
import { createCommentSchema } from '../common/utils';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: unknown, authorId: string) {
    const validated = createCommentSchema.parse(body);
    const targets = [
      validated.reviewId,
      validated.postId,
      validated.complaintId,
    ].filter((value): value is string => Boolean(value));
    if (targets.length === 0) {
      throw new BadRequestException(
        'Must provide reviewId, postId, or complaintId',
      );
    }
    if (targets.length > 1) {
      throw new BadRequestException(
        'Provide exactly one of reviewId, postId, or complaintId',
      );
    }

    const comment = await this.prisma.comment.create({
      data: {
        content: validated.content,
        authorId,
        reviewId: validated.reviewId,
        postId: validated.postId,
        complaintId: validated.complaintId,
        parentId: validated.parentId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true,
          },
        },
        _count: {
          select: {
            reactions: true,
            votes: true,
            replies: true,
          },
        },
      },
    });

    return comment;
  }

  private async listComments(
    reviewId?: string,
    postId?: string,
    complaintId?: string,
    user?: { id: string } | null,
  ) {
    const where: Record<string, unknown> = { parentId: null };
    if (reviewId) where.reviewId = reviewId;
    if (postId) where.postId = postId;
    if (complaintId) where.complaintId = complaintId;

    const comments = await this.prisma.comment.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true,
          },
        },
        replies: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                avatar: true,
                verified: true,
              },
            },
            _count: {
              select: {
                reactions: true,
                votes: true,
                replies: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            reactions: true,
            votes: true,
            replies: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let commentsWithVotes = comments;
    if (user && comments.length > 0) {
      const commentIds = comments.flatMap((c) => [
        c.id,
        ...c.replies.map((r) => r.id),
      ]);
      const userVotes = await this.prisma.commentVote.findMany({
        where: { userId: user.id, commentId: { in: commentIds } },
        select: { commentId: true, voteType: true },
      });
      const voteMap = new Map(userVotes.map((v) => [v.commentId, v.voteType]));
      commentsWithVotes = comments.map((comment) => ({
        ...comment,
        userVote: voteMap.get(comment.id) ?? null,
        helpfulCount: comment.helpfulCount ?? 0,
        downVoteCount: comment.downVoteCount ?? 0,
        replies: comment.replies.map((reply) => ({
          ...reply,
          userVote: voteMap.get(reply.id) ?? null,
          helpfulCount: reply.helpfulCount ?? 0,
          downVoteCount: reply.downVoteCount ?? 0,
        })),
      }));
    } else {
      commentsWithVotes = comments.map((comment) => ({
        ...comment,
        userVote: null,
        helpfulCount: comment.helpfulCount ?? 0,
        downVoteCount: comment.downVoteCount ?? 0,
        replies: comment.replies.map((reply) => ({
          ...reply,
          userVote: null,
          helpfulCount: reply.helpfulCount ?? 0,
          downVoteCount: reply.downVoteCount ?? 0,
        })),
      }));
    }

    return commentsWithVotes;
  }

  async list(
    reviewId?: string,
    postId?: string,
    complaintId?: string,
    user?: { id: string } | null,
  ) {
    const comments = await this.listComments(
      reviewId,
      postId,
      complaintId,
      user,
    );
    return { comments };
  }

  async getById(
    id: string,
    reviewId?: string,
    postId?: string,
    complaintId?: string,
    user?: { id: string } | null,
  ) {
    if (id === 'list') {
      const comments = await this.listComments(
        reviewId,
        postId,
        complaintId,
        user,
      );
      return { comments };
    }

    const where: Record<string, unknown> = { parentId: null };
    if (reviewId) where.reviewId = reviewId;
    if (postId) where.postId = postId;
    if (complaintId) where.complaintId = complaintId;
    where.id = id;

    const comments = await this.prisma.comment.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true,
          },
        },
        replies: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
                avatar: true,
                verified: true,
              },
            },
            _count: {
              select: {
                reactions: true,
                votes: true,
                replies: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            reactions: true,
            votes: true,
            replies: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let commentsWithVotes = comments;
    if (user && comments.length > 0) {
      const commentIds = comments.flatMap((c) => [
        c.id,
        ...c.replies.map((r) => r.id),
      ]);
      const userVotes = await this.prisma.commentVote.findMany({
        where: { userId: user.id, commentId: { in: commentIds } },
        select: { commentId: true, voteType: true },
      });
      const voteMap = new Map(userVotes.map((v) => [v.commentId, v.voteType]));
      commentsWithVotes = comments.map((comment) => ({
        ...comment,
        userVote: voteMap.get(comment.id) ?? null,
        replies: comment.replies.map((reply) => ({
          ...reply,
          userVote: voteMap.get(reply.id) ?? null,
        })),
      }));
    } else {
      commentsWithVotes = comments.map((comment) => ({
        ...comment,
        userVote: null,
        replies: comment.replies.map((reply) => ({
          ...reply,
          userVote: null,
        })),
      }));
    }

    return commentsWithVotes[0] ?? null;
  }

  async vote(commentId: string, voteType: string, userId: string) {
    if (!voteType || (voteType !== 'UP' && voteType !== 'DOWN')) {
      throw new BadRequestException('Invalid vote type. Must be UP or DOWN');
    }

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findUnique({
        where: { id: commentId },
        select: { id: true },
      });
      if (!comment) throw new NotFoundError('Comment not found');

      const existingVote = await tx.commentVote.findUnique({
        where: {
          userId_commentId: { userId, commentId },
        },
      });

      let nextVoteType: 'UP' | 'DOWN' | null = voteType;

      if (existingVote) {
        if (existingVote.voteType === voteType) {
          await tx.commentVote.delete({
            where: { id: existingVote.id },
          });
          nextVoteType = null;
        } else {
          await tx.commentVote.update({
            where: { id: existingVote.id },
            data: { voteType },
          });
        }
      } else {
        await tx.commentVote.create({
          data: {
            userId,
            commentId,
            voteType,
          },
        });
      }

      const [helpfulCount, downVoteCount] = await Promise.all([
        tx.commentVote.count({ where: { commentId, voteType: 'UP' } }),
        tx.commentVote.count({ where: { commentId, voteType: 'DOWN' } }),
      ]);

      await tx.comment.update({
        where: { id: commentId },
        data: { helpfulCount, downVoteCount },
      });

      return {
        voteType: nextVoteType,
        helpfulCount,
        downVoteCount,
      };
    });
  }
}
