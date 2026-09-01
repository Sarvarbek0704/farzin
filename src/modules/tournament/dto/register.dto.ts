import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsUUID } from 'class-validator';

/**
 * Ro'yxatga olish.
 *
 * `playerId` BERILMASA — self-registration: kim ro'yxatdan o'tishi
 * token'dan (aktor), qayerga — URL'dan (sectionId).
 *
 * `playerId` BERILSA — hakam/tashkilotchi BOSHQA o'yinchini ro'yxatga
 * oladi (docs/14-roadmap.md Faza 1: "o'zi yoki hakam tomonidan").
 * Bu holat RBAC'da AVTOMATIK qattiqroq tekshiriladi: service
 * `ownerUserId` ni UZATMAYDI, ya'ni `own` scope qamramaydi va faqat
 * turnir/klub/federatsiya darajasidagi (yoki global) grant o'tadi —
 * rbac.service.ts "noaniqlik = rad" qoidasi.
 */
export class RegisterDto {
  @ApiPropertyOptional({
    description: "Boshqa o'yinchini ro'yxatga olish (hakam oqimi). Berilmasa — o'zini.",
  })
  @IsOptional()
  @IsUUID()
  playerId?: string;
}

/**
 * Ommaviy ro'yxatga olish — MAVJUD o'yinchilar ro'yxati bo'yicha.
 *
 * ⚠️  Bu endpoint yangi o'yinchi PROFILI YARATMAYDI. Sabab: profilsiz
 *     odamlarni CSV'dan yaratish voyaga yetmaganlar ma'lumotiga tegadi
 *     va docs/README.md uni BLOKLOVCHI ochiq savol deb belgilaydi
 *     ("bolalar ma'lumoti bilan ishlash qonuniy talablari — Yurist").
 *     Shu savol hal bo'lmaguncha provisioning qurilmaydi.
 *
 * 200 chegarasi: bitta seksiyada real ishtirokchi soni shundan kam
 * (docs/05 §7 500 o'yinchini eng katta stsenariy deb beradi, u ham
 * bir necha seksiyaga bo'linadi), va cheklovsiz massiv — DoS yuzasi.
 */
export class BulkRegisterDto {
  @ApiProperty({
    description: "Mavjud o'yinchi profillari identifikatorlari",
    type: [String],
    maxItems: 200,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  playerIds!: string[];
}
