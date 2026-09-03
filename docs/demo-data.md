# 演示数据

仓库不包含生产数据库。如需在空数据库中展示主要界面，请先启动服务，然后在另一个终端运行：

```bash
pnpm demo:seed
```

脚本从本地 `.env` 读取共享密码，并通过公开 API 创建两个虚构项目。不会从任何 Excel、SQLite 备份或内部文件复制数据。

如果服务不在默认地址，可以指定：

```bash
SHOWCASE_ORIGIN=http://127.0.0.1:3000 SHOWCASE_PASSWORD=your-local-password pnpm demo:seed
```

请仅在本地或专用演示环境中使用该脚本。
