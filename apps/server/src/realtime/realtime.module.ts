import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsGateway } from "./projects.gateway";

@Module({
  imports: [AuthModule],
  providers: [ProjectsGateway],
  exports: [ProjectsGateway],
})
export class RealtimeModule {}
