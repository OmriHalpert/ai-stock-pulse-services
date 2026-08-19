import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateStockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  ticker!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;
}
