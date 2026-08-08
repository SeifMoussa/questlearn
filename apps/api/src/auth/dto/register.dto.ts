import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(10, { message: "Password must be at least 10 characters." })
  @MaxLength(255)
  @Matches(/[a-zA-Z]/, {
    message: "Password must contain at least one letter.",
  })
  @Matches(/[0-9]/, { message: "Password must contain at least one number." })
  password!: string;

  @IsString()
  @MinLength(1, { message: "Name is required." })
  @MaxLength(255)
  name!: string;
}
