import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async check(@Res() res: Response): Promise<void> {
    const databaseUp = await this.db.isHealthy();
    res.status(databaseUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      status: databaseUp ? 'ok' : 'degraded',
      service: 'backend',
      database: databaseUp ? 'up' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }
}
