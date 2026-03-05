import { IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ReviewStatus } from '@prisma/client';

export class UpdateReviewStatusDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  @IsEnum(ReviewStatus, {
    message: 'status must be one of: PENDING, APPROVED, REJECTED, FLAGGED',
  })
  status: ReviewStatus;
}
