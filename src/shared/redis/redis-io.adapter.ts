import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis, type RedisOptions } from 'ioredis';
import type { ServerOptions, Server } from 'socket.io';

/**
 * Socket.IO Redis adapter — ko'p instance orasida room broadcast
 * (docs/07-realtime-and-clock.md §10.1).
 *
 * Bir instance'da `server.to(room).emit()` faqat o'sha instance'ga ulangan
 * socketlarga yetadi; Redis adapter emit'ni pub/sub orqali barcha
 * instance'larga tarqatadi. Narxi: har broadcast +1 Redis hop (~0.5–2 ms) —
 * §10.1 da ochiq tan olingan.
 *
 * MUHIM: pub/sub uchun IKKITA ALOHIDA ulanish kerak — subscribe holatidagi
 * ioredis klienti oddiy buyruq yubora olmaydi. Shu sababli asosiy REDIS
 * tokenidagi klient ISHLATILMAYDI: bu yerda ikkita maxsus ulanish ochiladi
 * va process bilan birga yashaydi (main.ts bootstrap'ida ulanadi).
 *
 * Testlarda (app.harness.ts) adapter O'RNATILMAYDI — bitta instance uchun
 * default in-memory adapter yetarli; bu hujjatlangan soddalashtirish.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  async connectToRedis(options: RedisOptions): Promise<void> {
    this.pubClient = new Redis({ ...options, lazyConnect: true });
    this.subClient = this.pubClient.duplicate();
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor !== null) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  /** app.close() da Nest chaqiradi — pub/sub ulanishlari ham yopiladi. */
  override async dispose(): Promise<void> {
    await super.dispose();
    await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
  }
}
