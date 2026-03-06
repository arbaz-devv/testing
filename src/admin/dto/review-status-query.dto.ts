import { IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { ReviewStatus } from '@prisma/client';

export class ReviewStatusQueryDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.toUpperCase().trim() : (value as unknown),
  )
  @IsEnum(ReviewStatus, {
    message: 'status must be one of: PENDING, APPROVED, REJECTED, FLAGGED',
  })
  status?: ReviewStatus;
}
