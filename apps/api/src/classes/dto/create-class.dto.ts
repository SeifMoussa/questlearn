import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateClassDto {
  @IsString()
  @MinLength(1, { message: "Class name is required." })
  @MaxLength(255)
  name!: string;
}
