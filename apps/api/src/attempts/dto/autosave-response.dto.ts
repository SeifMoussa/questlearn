import { IsOptional } from "class-validator";

/**
 * `responseValue` carries no shape constraints beyond `@IsOptional()`:
 * its real shape depends on the target question's type (string |
 * string[] | boolean | number | null), exactly like
 * `QuestionVersion.correctAnswer`. The global `ValidationPipe` runs
 * with `whitelist: true`, which strips any property that has zero
 * validation decorators — `@IsOptional()` is the minimum decoration
 * needed to keep the field instead of silently dropping it, without
 * imposing a shape check at this layer (validated, if at all,
 * downstream by the scoring logic itself).
 */
export class AutosaveResponseDto {
  @IsOptional()
  responseValue?: unknown;
}
