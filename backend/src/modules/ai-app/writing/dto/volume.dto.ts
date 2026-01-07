import { IsString, IsOptional, IsNumber, Min } from "class-validator";

export class CreateVolumeDto {
  @IsNumber()
  @Min(1)
  volumeNumber!: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  synopsis?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetWords?: number;
}

export class UpdateVolumeDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  synopsis?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetWords?: number;
}
