import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { WorkItemsController } from "./work-items.controller";
import { WorkItemsService } from "./work-items.service";

@Module({
  imports: [RealtimeModule],
  controllers: [WorkItemsController],
  providers: [WorkItemsService],
  exports: [WorkItemsService],
})
export class WorkItemsModule {}
