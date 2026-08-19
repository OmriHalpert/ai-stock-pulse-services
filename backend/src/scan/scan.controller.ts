import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ScanService } from './scan.service';

@Controller('scan')
export class ScanController {
  constructor(private readonly scan: ScanService) {}

  /** Called by the dashboard's "Scan now" button. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  request() {
    return this.scan.request();
  }

  @Get()
  status() {
    return this.scan.status();
  }

  /** Called by the agent; consumes the pending request. */
  @Post('claim')
  @HttpCode(HttpStatus.OK)
  claim() {
    return this.scan.claim();
  }
}
