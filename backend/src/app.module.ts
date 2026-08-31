import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { MetricsController } from './metrics/metrics.controller';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { ScanModule } from './scan/scan.module';
import { StocksModule } from './stocks/stocks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    DatabaseModule,
    StocksModule,
    RecommendationsModule,
    ScanModule,
  ],
  controllers: [HealthController, MetricsController],
})
export class AppModule {}
