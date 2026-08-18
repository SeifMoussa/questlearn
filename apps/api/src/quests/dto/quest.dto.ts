import { QuestMasteryThreshold } from "@prisma/client";
import { ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateQuestDto {
  @IsString()
  @MinLength(1, { message: "Title is required." })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateQuestDto {
  @IsString()
  @MinLength(1, { message: "Title is required." })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

/**
 * Shared shape for both adding and editing a step. At least one of
 * `activityId` or (`requiredConceptId` + `requiredMasteryState`) must
 * be present — that cross-field rule isn't expressible cleanly with
 * class-validator decorators alone, so `QuestsService` enforces it,
 * matching how `ActivitiesService.reorder` validates its own
 * cross-field "same set" rule at the service layer rather than in the
 * DTO. Editing a step is a full replace, not a partial patch — same
 * "resubmit the whole gate config" posture as `QuestionPayloadDto`.
 */
export class QuestStepGateDto {
  @IsOptional()
  @IsUUID()
  activityId?: string;

  @IsOptional()
  @IsUUID()
  requiredConceptId?: string;

  @IsOptional()
  @IsEnum(QuestMasteryThreshold, { message: "requiredMasteryState must be one of the four mastery states." })
  requiredMasteryState?: QuestMasteryThreshold;
}

export class ReorderQuestStepsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  stepIds!: string[];
}
