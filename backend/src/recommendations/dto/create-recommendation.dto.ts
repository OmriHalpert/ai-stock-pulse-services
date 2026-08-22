import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const SENTIMENTS = ['BULLISH', 'BEARISH', 'NEUTRAL'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const TRIGGERS = [
  'MOMENTUM_SHIFT',
  'EARNINGS_EVENT',
  'ANALYST_ACTION',
  'TREND_CONFIRMATION',
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export class CreateRecommendationDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  ticker!: string;

  @IsIn(SENTIMENTS)
  sentiment!: Sentiment;

  @IsString()
  @MinLength(1)
  recommendation!: string;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsString()
  @MinLength(1)
  newsSummary!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  priceChange30d?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dailyChange?: string;

  @IsOptional()
  @IsIn(TRIGGERS)
  trigger?: Trigger;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sources?: string[];
}
