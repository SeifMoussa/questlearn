import { IsDateString, IsUUID } from "class-validator";

export class CreateAssignmentDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  activityId!: string;

  @IsDateString({}, { message: "Enter a valid due date." })
  dueAt!: string;
}

export class UpdateAssignmentDto {
  @IsDateString({}, { message: "Enter a valid due date." })
  dueAt!: string;
}
