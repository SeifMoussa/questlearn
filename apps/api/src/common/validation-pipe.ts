import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { ValidationError } from "class-validator";

/**
 * The shared validation pipe for both main.ts and the integration
 * test app. Nest's default class-validator exception factory flattens
 * every constraint message into one array with no field association;
 * the frontend needs per-field errors, so this rebuilds the shape as
 * `{ message, fieldErrors: { <field>: string[] } }`.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const fieldErrors: Record<string, string[]> = {};
      for (const error of errors) {
        if (error.constraints) {
          fieldErrors[error.property] = Object.values(error.constraints);
        }
      }
      return new BadRequestException({
        message: "Validation failed.",
        fieldErrors,
      });
    },
  });
}
