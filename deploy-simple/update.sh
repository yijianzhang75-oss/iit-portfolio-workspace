#!/usr/bin/env bash
set -euo pipefail

[[ "${EUID}" -eq 0 ]] || { echo "请使用 sudo" >&2; exit 1; }
[[ "${1:-}" == "--release" && -n "${2:-}" ]] || { echo "用法：sudo bash update.sh --release /root/iit-pm-release" >&2; exit 2; }
release="$(cd "$2" && pwd -P)"
for required in VERSION apps/server/dist/main.js apps/server/dist/cli.js apps/web/dist/index.html database/migrations; do
  [[ -e "${release}/${required}" ]] || { echo "发布包不完整，缺少：${required}" >&2; exit 1; }
done
version="$(tr -d '\r\n' <"${release}/VERSION")"
[[ "${version}" =~ ^[0-9A-Za-z._-]+$ ]] || { echo "VERSION 格式错误" >&2; exit 1; }
target="/opt/iit-pm/releases/${version}"
[[ ! -e "${target}" ]] || { echo "版本已存在：${target}" >&2; exit 1; }
current="$(readlink -f /opt/iit-pm/current)"
case "${current}" in /opt/iit-pm/releases/*) ;; *) echo "当前版本路径异常" >&2; exit 1 ;; esac
export PATH="/opt/iit-pm/runtime/bin:${PATH}"

database_path="$(sed -n 's/^DATABASE_PATH=//p' /opt/iit-pm/.env | tail -n 1)"
attachment_path="$(sed -n 's/^ATTACHMENT_PATH=//p' /opt/iit-pm/.env | tail -n 1)"
[[ -n "${database_path}" && -n "${attachment_path}" ]] || { echo "缺少数据库或附件路径配置" >&2; exit 1; }
runuser -u iitpm -- env DATABASE_PATH="${database_path}" ATTACHMENT_PATH="${attachment_path}" \
  /opt/iit-pm/runtime/bin/node "${current}/apps/server/dist/cli.js" backup:create --output /opt/iit-pm/backups
cp -a "${release}" "${target}"
chown -R root:root "${target}"
(cd "${target}" && /opt/iit-pm/runtime/bin/pnpm install --prod --frozen-lockfile --filter @iit/server...)
ln -sfn "${target}" /opt/iit-pm/current
systemctl restart iit-pm.service

for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null; then echo "已更新到 ${version}"; exit 0; fi
  sleep 1
done
ln -sfn "${current}" /opt/iit-pm/current
systemctl restart iit-pm.service
echo "新版本启动失败，程序已回退；数据库备份位于 /opt/iit-pm/backups" >&2
exit 1
