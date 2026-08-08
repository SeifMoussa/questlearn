import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Class name is required." })
  @MaxLength(255)
  name?: string;

  // true archives the class, false un-archives it. Omit to leave the
  // archived state unchanged.
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
