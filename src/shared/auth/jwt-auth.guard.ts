import { type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Global autentifikatsiya guard'i.
 *
 * DEFAULT YOPIQ: har endpoint token talab qiladi, @Public() bilan
 * belgilanganlardan tashqari. Strategiya: identity modulidagi JwtStrategy
 * ('jwt' nomi bilan passport registri orqali bog'lanadi).
 *
 * @see docs/10-security.md
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
