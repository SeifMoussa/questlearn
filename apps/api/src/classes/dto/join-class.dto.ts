import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * `name`/`email`/`password` are optional at the DTO level because they
 * are only required on the "brand-new learner" redemption path — when a
 * valid learner access token is already present, the service ignores
 * them entirely and creates a `RosterEntry` for the existing account.
 * `ClassesService.redeemJoinCode` enforces the conditional requirement.
 */
export class JoinClassDto {
  @IsString()
  @MinLength(1, { message: "Join code is required." })
  @MaxLength(32)
  joinCode!: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Name is required." })
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(10, { message: "Password must be at least 10 characters." })
  @MaxLength(255)
  password?: string;
}
