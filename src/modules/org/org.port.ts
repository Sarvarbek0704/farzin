/**
 * Org modulining PUBLIC porti.
 *
 * Boshqa modullar (`tournament`, `school`, ...) tashkiliy ierarxiya
 * (federatsiya → viloyat → klub) kontekstini FAQAT shu interfeys orqali
 * oladi — `clubs`/`regions` jadvallarini to'g'ridan-to'g'ri O'QIMAYDI.
 * docs/02-architecture.md §6.1
 *
 * Kontekst nima uchun kerak: RBAC scope tekshiruvi YUKLANGAN obyektning
 * to'liq ierarxiyasi bilan ishlaydi (docs/10-security.md §3) — masalan,
 * klubga bog'langan turnir uchun clubId → regionId → federationId
 * zanjiri hal qilinishi shart.
 */

export interface ClubContext {
  clubId: string;
  regionId: string;
  federationId: string;
}

export interface RegionContext {
  regionId: string;
  federationId: string;
}

export interface OrgPort {
  findClubContext(clubId: string): Promise<ClubContext | null>;
  findRegionContext(regionId: string): Promise<RegionContext | null>;
}

export const ORG_PORT = Symbol('ORG_PORT');
