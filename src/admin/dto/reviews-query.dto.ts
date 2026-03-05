import {
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { ReviewStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { PageLimitDto } from './page-limit.dto';
import { IsDateRangeValid } from './date-range.validator';

export class ReviewsQueryDto extends PageLimitDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  @IsEnum(ReviewStatus, {
    message:
      'status must be one of: PENDING, APPROVED, REJECTED, FLAGGED',
  })
  status?: ReviewStatus;

  @IsOptional()
  @IsString({ message: 'q must be a string' })
  @MaxLength(200, { message: 'q must not exceed 200 characters' })
  q?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dateFrom must be a valid ISO 8601 date string' })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dateTo must be a valid ISO 8601 date string' })
  @IsDateRangeValid('dateFrom', {
    message: 'dateTo must be greater than or equal to dateFrom',
  })
  dateTo?: string;
}
