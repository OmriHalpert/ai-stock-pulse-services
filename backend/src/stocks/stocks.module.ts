import { Module } from '@nestjs/common';
import { StocksController } from './stocks.controller';
import { StocksService } from './stocks.service';
import { WatchlistController } from './watchlist.controller';

@Module({
  controllers: [StocksController, WatchlistController],
  providers: [StocksService],
  exports: [StocksService],
})
export class StocksModule {}
