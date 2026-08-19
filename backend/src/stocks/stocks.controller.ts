import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StocksService } from './stocks.service';
import { CreateStockDto } from './dto/create-stock.dto';
import { resolveUserId } from '../common/user-id.util';

@Controller('stocks')
export class StocksController {
  private readonly defaultUserId: string;

  constructor(
    private readonly stocks: StocksService,
    config: ConfigService,
  ) {
    this.defaultUserId = config.get<string>('DEFAULT_USER_ID', 'default-user');
  }

  @Get()
  async list(@Query('userId') userId?: string) {
    return this.stocks.findAll(resolveUserId(userId, this.defaultUserId));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(@Body() dto: CreateStockDto) {
    return this.stocks.add(
      resolveUserId(dto.userId, this.defaultUserId),
      dto.ticker,
    );
  }

  @Delete(':ticker')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('ticker') ticker: string, @Query('userId') userId?: string) {
    await this.stocks.remove(resolveUserId(userId, this.defaultUserId), ticker);
  }
}
