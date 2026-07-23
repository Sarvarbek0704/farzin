import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  type HealthCheckResult,
  type HealthIndicatorResult,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Redis } from 'ioredis';

import { Public } from '../../shared/auth/public.decorator';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { REDIS } from '../../shared/redis/redis.module';

/**
 * Health check.
 *
 * Kubernetes uchun ikkita ALOHIDA probe kerak va ularni aralashtirish
 * klassik xato:
 *
 *  - /health/live   — "process tirikmi?" Yiqilsa → pod QAYTA ISHGA TUSHIRILADI.
 *                     Shuning uchun DB ni TEKSHIRMAYDI. Aks holda DB bir
 *                     soniya sekinlashsa, Kubernetes butun flotni qayta
 *                     ishga tushiradi va vaziyat yomonlashadi.
 *
 *  - /health/ready  — "trafik qabul qila oladimi?" Yiqilsa → pod
 *                     load balancer'dan CHIQARILADI, lekin o'ldirilmaydi.
 *                     DB va Redis shu yerda tekshiriladi.
 *
 * @see docs/11-infrastructure.md §4
 */
@ApiExcludeController()
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly indicator: HealthIndicatorService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Liveness — process tirikmi.
   * Tashqi bog'liqlik TEKSHIRILMAYDI (yuqoridagi sabab).
   */
  @Get('live')
  @HealthCheck()
  live(): Promise<HealthCheckResult> {
    return this.health.check([
      // Heap 512 MiB dan oshsa — xotira sizishi alomati.
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }

  /**
   * Readiness — trafik qabul qila oladimi.
   */
  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      () => this.redisCheck(),
    ]);
  }

  private async redisCheck(): Promise<HealthIndicatorResult> {
    const check = this.indicator.check('redis');
    try {
      await this.redis.ping();
      return check.up();
    } catch {
      return check.down();
    }
  }

  @Get()
  root(): { status: string; service: string; version: string } {
    return { status: 'ok', service: 'farzin-api', version: '0.1.0' };
  }
}
