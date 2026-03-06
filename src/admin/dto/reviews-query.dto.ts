import {
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ReviewStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { PageLimitDto } from './page-limit.dto';
import { IsDateRangeValid } from './date-range.validator';

export class ReviewsQueryDto extends PageLimitDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return value as unknown;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return value as unknown;
  })
  @IsBoolean({
    message: 'includeTotal must be a boolean value (true or false)',
  })
  includeTotal?: boolean = true;

  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.toUpperCase().trim() : (value as unknown),
  )
  @IsEnum(ReviewStatus, {
    message: 'status must be one of: PENDING, APPROVED, REJECTED, FLAGGED',
  })
  status?: ReviewStatus;

  @IsOptional()
  @IsString({ message: 'q must be a string' })
  @MaxLength(200, { message: 'q must not exceed 200 characters' })
  q?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'dateFrom must be a valid ISO 8601 date string' },
  )
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dateTo must be a valid ISO 8601 date string' })
  @IsDateRangeValid('dateFrom', {
    message: 'dateTo must be greater than or equal to dateFrom',
  })
  dateTo?: string;
}
