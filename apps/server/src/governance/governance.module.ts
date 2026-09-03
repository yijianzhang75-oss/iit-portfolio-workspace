import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { GovernanceController } from "./governance.controller";
import { GovernanceService } from "./governance.service";

@Module({
  imports: [RealtimeModule],
  controllers: [GovernanceController],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
