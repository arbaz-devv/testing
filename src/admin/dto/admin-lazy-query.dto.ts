import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class AdminLazyQueryDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return value as unknown;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return value as unknown;
  })
  @IsBoolean({ message: 'lazy must be a boolean value (true or false)' })
  lazy?: boolean = false;
}
