import { ArrayMinSize, ArrayUnique, IsArray, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateActivityDto {
  @IsString()
  @MinLength(1, { message: "Title is required." })
  @MaxLength(200)
  title!: string;
}

export class UpdateActivityDto {
  @IsString()
  @MinLength(1, { message: "Title is required." })
  @MaxLength(200)
  title!: string;
}

export class AddActivityQuestionDto {
  @IsUUID()
  questionId!: string;
}

export class ReorderActivityQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  activityQuestionIds!: string[];
}
