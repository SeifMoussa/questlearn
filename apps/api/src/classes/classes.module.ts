import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { ClassesController } from "./classes.controller";
import { JoinController } from "./join.controller";
import { ClassesService } from "./classes.service";

@Module({
  imports: [JwtModule.register({}), AuthModule],
  controllers: [ClassesController, JoinController],
  providers: [ClassesService],
})
export class ClassesModule {}
