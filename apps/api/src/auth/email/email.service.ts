import { Injectable, Logger } from "@nestjs/common";

/**
 * Abstraction over "send this account-lifecycle email". QuestLearn has
 * no real email provider wired up yet (see README known limitations),
 * so `DevEmailService` below is the only implementation: it logs the
 * link/token to the server log instead of sending anything, which is
 * enough to drive verification and password reset manually or from
 * the Playwright auth flow in development and CI.
 *
 * A real provider (e.g. Postmark, SES) can implement this same
 * interface later without touching AuthService.
 */
export abstract class EmailService {
  abstract sendVerificationEmail(params: {
    to: string;
    token: string;
  }): Promise<void>;

  abstract sendPasswordResetEmail(params: {
    to: string;
    token: string;
  }): Promise<void>;
}

@Injectable()
export class DevEmailService extends EmailService {
  private readonly logger = new Logger("EmailService");

  async sendVerificationEmail({
    to,
    token,
  }: {
    to: string;
    token: string;
  }): Promise<void> {
    this.logger.log({
      event: "verification_email",
      to,
      token,
      note: "No real email provider is configured; this token would normally be emailed as a link.",
    });
  }

  async sendPasswordResetEmail({
    to,
    token,
  }: {
    to: string;
    token: string;
  }): Promise<void> {
    this.logger.log({
      event: "password_reset_email",
      to,
      token,
      note: "No real email provider is configured; this token would normally be emailed as a link.",
    });
  }
}
