import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import { QuestionType } from "@prisma/client";

export class QuestionOptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id!: string;

  @IsString()
  @MinLength(1, { message: "Option text is required." })
  @MaxLength(500)
  text!: string;
}

/**
 * Validates `correctAnswer` against the sibling `type` (and, for the
 * choice types, the sibling `options` list) field on the same DTO
 * instance. class-validator custom constraints can read sibling
 * properties via `args.object`, which is how a single DTO class can
 * enforce a per-type shape without five separate DTO subclasses.
 */
@ValidatorConstraint({ name: "correctAnswerForType", async: false })
class CorrectAnswerForTypeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as QuestionPayloadDto;
    const optionIds = (dto.options ?? []).map((o) => o?.id).filter((id): id is string => typeof id === "string");

    switch (dto.type) {
      case QuestionType.single_choice:
        return typeof value === "string" && value.length > 0 && optionIds.includes(value);

      case QuestionType.multiple_choice:
        return (
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((v) => typeof v === "string" && optionIds.includes(v)) &&
          new Set(value).size === value.length
        );

      case QuestionType.true_false:
        return typeof value === "boolean";

      case QuestionType.short_text:
        return (
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((v) => typeof v === "string" && v.trim().length > 0)
        );

      case QuestionType.numeric: {
        if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
        const candidate = value as { value?: unknown; tolerance?: unknown };
        if (typeof candidate.value !== "number" || !Number.isFinite(candidate.value)) return false;
        if (
          candidate.tolerance !== undefined &&
          (typeof candidate.tolerance !== "number" || !Number.isFinite(candidate.tolerance) || candidate.tolerance < 0)
        ) {
          return false;
        }
        return true;
      }

      default:
        return false;
    }
  }

  defaultMessage(): string {
    return "correctAnswer is not a valid shape for this question type.";
  }
}

/**
 * Nothing else stops two options in the same payload sharing an id --
 * `CorrectAnswerForTypeConstraint` only checks that `correctAnswer`
 * refers to a *member* of `optionIds`, not that those ids are
 * distinct, so a duplicate id would silently make one option
 * unreachable as a correct answer while masquerading as valid.
 */
@ValidatorConstraint({ name: "uniqueOptionIds", async: false })
class UniqueOptionIdsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value)) return true; // shape is covered by @IsArray/@ValidateNested
    const ids = value.map((o) => (o as { id?: unknown })?.id).filter((id): id is string => typeof id === "string");
    return new Set(ids).size === ids.length;
  }

  defaultMessage(): string {
    return "Option ids must be unique within a question.";
  }
}

/**
 * Shared shape for both create and edit. Every edit resubmits the
 * full question content (prompt, options, correctAnswer, etc.) and
 * always produces a brand-new `QuestionVersion` — there is no partial
 * "patch just this field" edit path, matching the always-version
 * decision in the module brief.
 */
export class QuestionPayloadDto {
  @IsEnum(QuestionType, { message: "type must be one of the five supported question types." })
  type!: QuestionType;

  @IsString()
  @MinLength(1, { message: "Prompt is required." })
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  points?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  hint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string;

  @ValidateIf((o: QuestionPayloadDto) => o.type === QuestionType.single_choice || o.type === QuestionType.multiple_choice)
  @IsArray()
  @ArrayMinSize(2, { message: "Choice questions need at least 2 options." })
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @Validate(UniqueOptionIdsConstraint)
  options?: QuestionOptionDto[];

  @Validate(CorrectAnswerForTypeConstraint)
  correctAnswer!: unknown;
}

export class CreateQuestionDto extends QuestionPayloadDto {}

export class UpdateQuestionDto extends QuestionPayloadDto {}
