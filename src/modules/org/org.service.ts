import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../../core/errors/domain.error';
import { type Actor, RbacService } from '../identity/rbac.port';
import type { ClubContext, OrgPort, RegionContext } from './org.port';
import { type ClubRow, type FederationRow, OrgRepository, type RegionRow } from './org.repository';

/**
 * Org — federatsiya → viloyat → klub. [CANON 5] #3.
 *
 * IDOR himoyasi: har yozuv amali YUKLANGAN obyektning ierarxiya
 * identifikatorlari bilan tekshiriladi (`rbac.can(actor, ..., { clubId,
 * regionId, federationId })`) — rolning o'zi yetarli emas.
 * docs/10-security.md §3, docs/01-product-spec.md §4
 */
@Injectable()
export class OrgService implements OrgPort {
  constructor(
    private readonly org: OrgRepository,
    private readonly rbac: RbacService,
  ) {}

  // --- Federation ---------------------------------------------------------

  listFederations(): Promise<FederationRow[]> {
    return this.org.listFederations();
  }

  async createFederation(
    actor: Actor,
    input: { name: string; shortName: string; countryCode: string },
  ): Promise<FederationRow> {
    if (!this.rbac.can(actor, 'create', { type: 'Federation' })) {
      throw new NotFoundError('Federation');
    }
    return await this.org.createFederation(input, actor.userId);
  }

  // --- Region ---------------------------------------------------------------

  listRegions(federationId?: string): Promise<RegionRow[]> {
    return this.org.listRegions(federationId);
  }

  async createRegion(
    actor: Actor,
    input: { federationId: string; name: string; soatoCode?: string | undefined },
  ): Promise<RegionRow> {
    const allowed = this.rbac.can(actor, 'create', {
      type: 'Region',
      federationId: input.federationId,
    });
    if (!allowed) {
      throw new NotFoundError('Region');
    }
    return await this.org.createRegion(input, actor.userId);
  }

  // --- Club -----------------------------------------------------------------

  listClubs(regionId?: string): Promise<ClubRow[]> {
    return this.org.listClubs(regionId);
  }

  async getClub(id: string): Promise<ClubRow> {
    const club = await this.org.findClubById(id);
    if (club === null) {
      throw new NotFoundError('Club', id);
    }
    return club;
  }

  async createClub(
    actor: Actor,
    input: {
      regionId: string;
      name: string;
      slug: string;
      address?: string | undefined;
      contactPhone?: string | undefined;
      contactEmail?: string | undefined;
    },
  ): Promise<ClubRow> {
    // Viloyat yuklanadi — federatsiya konteksti scope tekshiruvi uchun kerak.
    const region = await this.org.findRegionById(input.regionId);
    if (region === null) {
      throw new NotFoundError('Region', input.regionId);
    }

    const allowed = this.rbac.can(actor, 'create', {
      type: 'Club',
      regionId: region.id,
      federationId: region.federationId,
    });
    if (!allowed) {
      throw new NotFoundError('Club');
    }
    return await this.org.createClub(input, actor.userId);
  }

  async updateClub(
    actor: Actor,
    clubId: string,
    input: {
      name?: string;
      address?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
    },
  ): Promise<ClubRow> {
    // Tekshiruv YUKLANGAN obyekt bilan — id bilan emas. docs/10-security.md §3
    const club = await this.org.findClubById(clubId);
    if (club === null) {
      throw new NotFoundError('Club', clubId);
    }
    const region = await this.org.findRegionById(club.regionId);

    const allowed = this.rbac.can(actor, 'update', {
      type: 'Club',
      clubId: club.id,
      regionId: club.regionId,
      ...(region !== null && { federationId: region.federationId }),
    });
    if (!allowed) {
      // 403 EMAS — klub mavjudligi oshkor bo'lmasin. docs/04-api-spec.md §2.4
      throw new NotFoundError('Club', clubId);
    }
    return await this.org.updateClub(clubId, input, actor.userId);
  }

  // --- OrgPort (boshqa modullar uchun) --------------------------------------

  /** Klubning to'liq ierarxiya konteksti — RBAC scope tekshiruvi uchun. */
  async findClubContext(clubId: string): Promise<ClubContext | null> {
    const club = await this.org.findClubById(clubId);
    if (club === null) {
      return null;
    }
    const region = await this.org.findRegionById(club.regionId);
    if (region === null) {
      // FK Restrict tufayli bo'lmasligi kerak — himoya: noaniqlik = yo'q.
      return null;
    }
    return { clubId: club.id, regionId: region.id, federationId: region.federationId };
  }

  /** Viloyatning federatsiya konteksti — RBAC scope tekshiruvi uchun. */
  async findRegionContext(regionId: string): Promise<RegionContext | null> {
    const region = await this.org.findRegionById(regionId);
    return region === null ? null : { regionId: region.id, federationId: region.federationId };
  }
}
