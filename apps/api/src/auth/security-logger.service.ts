import { Injectable, Logger } from "@nestjs/common";

export type SecurityEvent =
  | "register"
  | "login_success"
  | "login_failure"
  | "email_verified"
  | "password_reset_requested"
  | "password_reset_completed"
  | "token_refreshed"
  | "logout"
  | "class_created"
  | "class_updated"
  | "class_archived"
  | "join_code_rotated"
  | "roster_entry_added"
  | "roster_entry_removed";

/**
 * Structured, append-only logging for auth events. Deliberately never
 * takes a password, raw token, or hash as a field — only identifiers
 * (actor id/email, tenant id) and metadata that are safe to retain in
 * log storage.
 */
@Injectable()
export class SecurityLogger {
  private readonly logger = new Logger("Security");

  log(
    event: SecurityEvent,
    details: Record<string, string | number | boolean | undefined>,
  ): void {
    this.logger.log({
      event,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }
}
