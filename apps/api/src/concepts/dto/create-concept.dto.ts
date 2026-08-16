import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateConceptDto {
  @IsString()
  @MinLength(1, { message: "Concept name is required." })
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
