import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { ConceptsController } from "./concepts.controller";
import { ConceptsService } from "./concepts.service";

@Module({
  imports: [JwtModule.register({}), AuthModule],
  controllers: [ConceptsController],
  providers: [ConceptsService],
  exports: [ConceptsService],
})
export class ConceptsModule {}
