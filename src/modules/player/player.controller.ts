import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../../shared/auth/authenticated-user';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { Public } from '../../shared/auth/public.decorator';
import type { Page } from '../../shared/pagination/cursor';
import { type Actor, CurrentActor } from '../identity/rbac.port';
import { ListPlayersQuery } from './dto/list-players.query';
import { UpdatePlayerDto } from './dto/update-player.dto';
import type { PlayerRow } from './player.repository';
import { PlayerService, type PublicPlayer } from './player.service';

@ApiTags('players')
@Controller('players')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Ommaviy o'yinchilar ro'yxati (cursor pagination, ism qidiruvi)" })
  list(@Query() query: ListPlayersQuery): Promise<Page<PublicPlayer>> {
    return this.playerService.listPublic(query.first, query.after, query.q);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "O'z profilim (yopiq bo'lsa ham ko'rinadi)" })
  me(@CurrentUser() user: AuthenticatedUser): Promise<PlayerRow> {
    return this.playerService.getOwn(user.userId);
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "O'z profilimni tahrirlash" })
  updateMe(@CurrentActor() actor: Actor, @Body() dto: UpdatePlayerDto): Promise<PlayerRow> {
    return this.playerService.updateOwn(actor, toUpdateInput(dto));
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Ommaviy profil' })
  @ApiResponse({ status: 404, description: 'Topilmadi YOKI yopiq — farq bildirilmaydi' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<PublicPlayer> {
    return this.playerService.getPublicById(id);
  }
}

/** DTO → repository input. exactOptionalPropertyTypes: faqat berilgan maydonlar. */
function toUpdateInput(dto: UpdatePlayerDto): {
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  fullNameCyrl?: string | null;
  birthDate?: Date | null;
  gender?: 'MALE' | 'FEMALE' | null;
  regionId?: string | null;
  isPublic?: boolean;
} {
  return {
    ...(dto.firstName !== undefined && { firstName: dto.firstName }),
    ...(dto.lastName !== undefined && { lastName: dto.lastName }),
    ...(dto.middleName !== undefined && { middleName: dto.middleName }),
    ...(dto.fullNameCyrl !== undefined && { fullNameCyrl: dto.fullNameCyrl }),
    ...(dto.birthDate !== undefined && { birthDate: dto.birthDate }),
    ...(dto.gender !== undefined && { gender: dto.gender }),
    ...(dto.regionId !== undefined && { regionId: dto.regionId }),
    ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
  };
}
