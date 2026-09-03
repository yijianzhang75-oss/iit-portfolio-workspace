import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({ imports: [RealtimeModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
