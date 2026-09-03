# Ubuntu 单机部署

适用于 Ubuntu 22.04/24.04、2 核 2 GB 左右配置、约 5 名内部成员的简化部署。服务器不需要 Docker、PostgreSQL 或 Redis，也不需要办公电脑长期开机。

## 首次安装

1. 在开发电脑执行 `pnpm build`，准备包含源码、构建产物和 `deploy-simple/` 的发布目录。
2. 将发布目录上传到服务器，例如 `/root/iit-pm-release`。
3. 使用云防火墙或安全组限制管理端口和应用访问来源。
4. 执行：

```bash
cd /root/iit-pm-release/deploy-simple
sudo bash install.sh --release /root/iit-pm-release
```

脚本会准备 Node.js 运行时、生产依赖、低权限系统用户、SQLite/附件/备份目录、systemd 服务和每日备份定时器，并提示设置内部共享密码。

无域名时的 HTTP 访问只适合访问来源已被严格限制的过渡环境。准备域名后应启用 HTTPS，并将 `COOKIE_SECURE` 设为 `true`。

## 更新

上传并解压新发布包后：

```bash
cd /root/new-iit-pm-release/deploy-simple
sudo bash update.sh --release /root/new-iit-pm-release
```

更新前会备份数据库和附件；新版本健康检查失败时会切回上一版程序。

## 常用命令

```bash
systemctl status iit-pm --no-pager
journalctl -u iit-pm -n 100 --no-pager
systemctl list-timers iit-pm-backup.timer
curl http://127.0.0.1:3000/api/v1/health
```
