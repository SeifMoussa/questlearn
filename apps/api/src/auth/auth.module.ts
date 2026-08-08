import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EmailService, DevEmailService } from "./email/email.service";
import { SecurityLogger } from "./security-logger.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    SecurityLogger,
    { provide: EmailService, useClass: DevEmailService },
  ],
  exports: [AuthService, SecurityLogger],
})
export class AuthModule {}
