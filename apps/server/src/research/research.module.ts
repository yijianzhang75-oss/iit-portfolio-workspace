import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { ResearchController } from "./research.controller";
import { ResearchService } from "./research.service";

@Module({
  imports: [RealtimeModule],
  controllers: [ResearchController],
  providers: [ResearchService],
  exports: [ResearchService],
})
export class ResearchModule {}
