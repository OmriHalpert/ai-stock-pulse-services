import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecommendationsService } from './recommendations.service';
import { CreateRecommendationDto } from './dto/create-recommendation.dto';
import { resolveUserId } from '../common/user-id.util';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Controller('recommendations')
export class RecommendationsController {
  private readonly defaultUserId: string;

  constructor(
    private readonly recommendations: RecommendationsService,
    config: ConfigService,
  ) {
    this.defaultUserId = config.get<string>('DEFAULT_USER_ID', 'default-user');
  }

  @Get()
  async list(
    @Query('userId') userId?: string,
    @Query('ticker') ticker?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '', 10);
    const safeLimit = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    return this.recommendations.findAll(
      resolveUserId(userId, this.defaultUserId),
      safeLimit,
      ticker,
    );
  }

  @Get('latest')
  async latest(@Query('userId') userId?: string) {
    return this.recommendations.findLatestPerTicker(
      resolveUserId(userId, this.defaultUserId),
    );
  }

  @Get('stats')
  async stats(@Query('userId') userId?: string) {
    return this.recommendations.stats(resolveUserId(userId, this.defaultUserId));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateRecommendationDto) {
    return this.recommendations.create(
      resolveUserId(dto.userId, this.defaultUserId),
      dto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('userId') userId?: string,
  ) {
    await this.recommendations.remove(
      resolveUserId(userId, this.defaultUserId),
      id,
    );
  }
}
