import { Controller, Get } from '@nestjs/common';
import { StocksService } from './stocks.service';

/**
 * Service-to-service endpoint. The Python agent polls this once per cycle to
 * learn which tenant tracks which tickers.
 */
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly stocks: StocksService) {}

  @Get()
  async list() {
    return this.stocks.watchlist();
  }
}
