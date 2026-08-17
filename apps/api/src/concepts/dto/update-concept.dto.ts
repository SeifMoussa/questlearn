import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateConceptDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Concept name is required." })
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // true archives the concept, false un-archives it. Omit to leave
  // the archived state unchanged.
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
