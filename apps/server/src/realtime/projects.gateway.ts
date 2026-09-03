import { parse } from "cookie";
import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class ProjectsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly auth: AuthService) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    const cookies = parse(client.handshake.headers.cookie ?? "");
    const token = cookies[this.auth.cookieName];
    const user = token ? await this.auth.resolveSession(token) : null;
    if (!user) return client.disconnect(true);
    client.data.user = user;
    await client.join("projects:list");
  }

  projectChanged(payload: { projectId: string; action: string; version: number }) {
    this.server.to("projects:list").emit("project.changed", payload);
    this.server.to(`project:${payload.projectId}`).emit("project.changed", payload);
  }
}
