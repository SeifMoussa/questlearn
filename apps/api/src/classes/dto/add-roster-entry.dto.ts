import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AddRosterEntryDto {
  @IsString()
  @MinLength(1, { message: "Name is required." })
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(255)
  email?: string;
}
