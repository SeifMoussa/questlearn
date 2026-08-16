import { ArrayUnique, IsArray, IsString } from "class-validator";

/**
 * Full replacement of a question's concept-tag set — not an
 * incremental add/remove. `conceptIds` may be empty (untag entirely).
 */
export class UpdateQuestionConceptsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  conceptIds!: string[];
}
