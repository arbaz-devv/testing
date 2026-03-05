import { IsIn } from 'class-validator';

export class UpdateReviewStatusDto {
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'FLAGGED'], {
    message: 'status must be one of: PENDING, APPROVED, REJECTED, FLAGGED',
  })
  status: string;
}
