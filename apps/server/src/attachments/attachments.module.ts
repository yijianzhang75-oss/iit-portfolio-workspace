import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";

@Module({
  imports: [RealtimeModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}

