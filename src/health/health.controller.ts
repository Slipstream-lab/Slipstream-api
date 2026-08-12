import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

/** Liveness/health response body. */
export class HealthResponse {
  status!: 'ok';
  service!: string;
  timestamp!: string;
  uptimeSeconds!: number;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ type: HealthResponse })
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'slipstream-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
