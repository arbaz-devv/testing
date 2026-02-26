import { Injectable } from '@nestjs/common';

@Injectable()
export class SocketService {
  private get io() {
    return globalThis.__socketIO ?? null;
  }

  emitReviewCreated(review: unknown): void {
    const io = this.io;
    if (!io) return;
    io.to('reviews').emit('review:created', review);
  }

  emitReviewUpdated(review: unknown): void {
    const io = this.io;
    if (!io) return;
    io.to('reviews').emit('review:updated', review);
  }

  emitReviewVoteUpdated(
    reviewId: string,
    helpfulCount: number,
    downVoteCount: number,
  ): void {
    const io = this.io;
    if (!io) return;
    io.to('reviews').emit('review:vote:updated', {
      reviewId,
      helpfulCount,
      downVoteCount,
    });
  }
}
