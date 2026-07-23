import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateFederationDto {
  @ApiProperty({ example: "O'zbekiston shaxmat federatsiyasi" })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'UzChess' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  shortName!: string;

  @ApiProperty({ example: 'UZB', description: 'ISO 3166-1 alpha-3' })
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  countryCode!: string;
}

export class CreateRegionDto {
  @ApiProperty()
  @IsUUID()
  federationId!: string;

  @ApiProperty({ example: 'Toshkent shahri' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'SOATO kodi' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  soatoCode?: string;
}

export class CreateClubDto {
  @ApiProperty()
  @IsUUID()
  regionId!: string;

  @ApiProperty({ example: 'Toshkent shaxmat klubi' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'toshkent-shaxmat-klubi', description: 'URL uchun unikal' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug: kichik harf, raqam va defis' })
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  contactEmail?: string;
}

export class UpdateClubDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  contactEmail?: string;
}
