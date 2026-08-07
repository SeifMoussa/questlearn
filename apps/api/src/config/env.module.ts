import { Global, Module } from "@nestjs/common";
import { Env, loadEnv } from "@questlearn/config";

export const ENV = Symbol("ENV");

/**
 * Makes the validated environment available for injection app-wide.
 * Validation itself happens once, in main.ts, before the Nest
 * application is even created, so a bad config fails startup
 * immediately rather than surfacing as a request-time error.
 */
@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): Env => loadEnv(),
    },
  ],
  exports: [ENV],
})
export class EnvModule {}
