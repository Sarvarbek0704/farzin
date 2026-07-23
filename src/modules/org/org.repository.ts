import { Injectable } from '@nestjs/common';

import { AuditService } from '../../shared/audit/audit.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface FederationRow {
  id: string;
  name: string;
  shortName: string;
  countryCode: string;
  logoUrl: string | null;
  website: string | null;
}

export interface RegionRow {
  id: string;
  federationId: string;
  name: string;
  soatoCode: string | null;
}

export interface ClubRow {
  id: string;
  regionId: string;
  name: string;
  slug: string;
  address: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface CreateClubInput {
  regionId: string;
  name: string;
  slug: string;
  address?: string | undefined;
  contactPhone?: string | undefined;
  contactEmail?: string | undefined;
}

export interface UpdateClubInput {
  name?: string;
  address?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

@Injectable()
export class OrgRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Federation ---------------------------------------------------------

  async listFederations(): Promise<FederationRow[]> {
    const rows = await this.prisma.federation.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return rows.map((f) => ({
      id: f.id,
      name: f.name,
      shortName: f.shortName,
      countryCode: f.countryCode,
      logoUrl: f.logoUrl,
      website: f.website,
    }));
  }

  async createFederation(
    input: { name: string; shortName: string; countryCode: string },
    actorUserId: string,
  ): Promise<FederationRow> {
    return await this.prisma.$transaction(async (tx) => {
      const created = await tx.federation.create({ data: input });
      await this.audit.write(tx, {
        action: 'org.federation.created',
        actorUserId,
        resourceType: 'Federation',
        resourceId: created.id,
        after: { name: created.name, countryCode: created.countryCode },
      });
      return {
        id: created.id,
        name: created.name,
        shortName: created.shortName,
        countryCode: created.countryCode,
        logoUrl: created.logoUrl,
        website: created.website,
      };
    });
  }

  // --- Region ---------------------------------------------------------------

  async listRegions(federationId?: string): Promise<RegionRow[]> {
    const rows = await this.prisma.region.findMany({
      where: federationId !== undefined ? { federationId } : {},
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      federationId: r.federationId,
      name: r.name,
      soatoCode: r.soatoCode,
    }));
  }

  async findRegionById(id: string): Promise<RegionRow | null> {
    const r = await this.prisma.region.findUnique({ where: { id } });
    return r === null
      ? null
      : { id: r.id, federationId: r.federationId, name: r.name, soatoCode: r.soatoCode };
  }

  async createRegion(
    input: { federationId: string; name: string; soatoCode?: string | undefined },
    actorUserId: string,
  ): Promise<RegionRow> {
    return await this.prisma.$transaction(async (tx) => {
      const created = await tx.region.create({
        data: {
          federationId: input.federationId,
          name: input.name,
          soatoCode: input.soatoCode ?? null,
        },
      });
      await this.audit.write(tx, {
        action: 'org.region.created',
        actorUserId,
        resourceType: 'Region',
        resourceId: created.id,
        after: { name: created.name, federationId: created.federationId },
      });
      return {
        id: created.id,
        federationId: created.federationId,
        name: created.name,
        soatoCode: created.soatoCode,
      };
    });
  }

  // --- Club -----------------------------------------------------------------

  async listClubs(regionId?: string): Promise<ClubRow[]> {
    const rows = await this.prisma.club.findMany({
      where: { deletedAt: null, ...(regionId !== undefined && { regionId }) },
      orderBy: { name: 'asc' },
    });
    return rows.map(toClubRow);
  }

  async findClubById(id: string): Promise<ClubRow | null> {
    const club = await this.prisma.club.findFirst({ where: { id, deletedAt: null } });
    return club === null ? null : toClubRow(club);
  }

  async createClub(input: CreateClubInput, actorUserId: string): Promise<ClubRow> {
    return await this.prisma.$transaction(async (tx) => {
      const created = await tx.club.create({
        data: {
          regionId: input.regionId,
          name: input.name,
          slug: input.slug,
          address: input.address ?? null,
          contactPhone: input.contactPhone ?? null,
          contactEmail: input.contactEmail ?? null,
        },
      });
      await this.audit.write(tx, {
        action: 'org.club.created',
        actorUserId,
        resourceType: 'Club',
        resourceId: created.id,
        after: { name: created.name, regionId: created.regionId, slug: created.slug },
      });
      return toClubRow(created);
    });
  }

  async updateClub(id: string, input: UpdateClubInput, actorUserId: string): Promise<ClubRow> {
    return await this.prisma.$transaction(async (tx) => {
      const before = await tx.club.findUniqueOrThrow({ where: { id } });
      const updated = await tx.club.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.address !== undefined && { address: input.address }),
          ...(input.contactPhone !== undefined && { contactPhone: input.contactPhone }),
          ...(input.contactEmail !== undefined && { contactEmail: input.contactEmail }),
        },
      });
      await this.audit.write(tx, {
        action: 'org.club.updated',
        actorUserId,
        resourceType: 'Club',
        resourceId: id,
        before: { name: before.name, address: before.address },
        after: { name: updated.name, address: updated.address },
      });
      return toClubRow(updated);
    });
  }
}

interface ClubModel {
  id: string;
  regionId: string;
  name: string;
  slug: string;
  address: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}

function toClubRow(club: ClubModel): ClubRow {
  return {
    id: club.id,
    regionId: club.regionId,
    name: club.name,
    slug: club.slug,
    address: club.address,
    contactPhone: club.contactPhone,
    contactEmail: club.contactEmail,
  };
}
