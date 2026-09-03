#!/usr/bin/env bash
set -euo pipefail

[[ "${EUID}" -eq 0 ]] || { echo "请使用 sudo bash install.sh --release <发布包目录>" >&2; exit 1; }
[[ "${1:-}" == "--release" && -n "${2:-}" ]] || { echo "用法：sudo bash install.sh --release /root/iit-pm-release" >&2; exit 2; }
release="$(cd "$2" && pwd -P)"

for required in VERSION apps/server/dist/main.js apps/server/dist/cli.js apps/web/dist/index.html database/migrations package.json pnpm-lock.yaml pnpm-workspace.yaml; do
  [[ -e "${release}/${required}" ]] || { echo "发布包不完整，缺少：${required}" >&2; exit 1; }
done
version="$(tr -d '\r\n' <"${release}/VERSION")"
[[ "${version}" =~ ^[0-9A-Za-z._-]+$ ]] || { echo "VERSION 格式错误" >&2; exit 1; }
target="/opt/iit-pm/releases/${version}"
[[ ! -e "${target}" ]] || { echo "版本已存在：${target}" >&2; exit 1; }

. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || { echo "此脚本仅支持 Ubuntu" >&2; exit 1; }
apt-get update
apt-get install -y ca-certificates curl xz-utils

if ! id iitpm >/dev/null 2>&1; then useradd --system --home-dir /opt/iit-pm --shell /usr/sbin/nologin iitpm; fi
install -d -o root -g root -m 0755 /opt/iit-pm /opt/iit-pm/releases
install -d -o iitpm -g iitpm -m 0750 /opt/iit-pm/data /opt/iit-pm/data/attachments /opt/iit-pm/backups

runtime="/opt/iit-pm/runtime"
if [[ ! -x "${runtime}/bin/node" || "$("${runtime}/bin/node" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" != "24" ]]; then
  temp_dir="$(mktemp -d)"
  case "${temp_dir}" in /tmp/*) ;; *) echo "临时目录异常" >&2; exit 1 ;; esac
  cleanup() { [[ -d "${temp_dir}" ]] && rm -rf -- "${temp_dir}"; }
  trap cleanup EXIT
  case "$(uname -m)" in x86_64) node_arch="x64" ;; aarch64) node_arch="arm64" ;; *) echo "不支持的 CPU 架构" >&2; exit 1 ;; esac
  curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "${temp_dir}/SHASUMS256.txt"
  node_file="$(awk -v suffix="linux-${node_arch}.tar.xz" '$2 ~ suffix"$" {print $2; exit}' "${temp_dir}/SHASUMS256.txt")"
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/${node_file}" -o "${temp_dir}/${node_file}"
  (cd "${temp_dir}" && grep " ${node_file}$" SHASUMS256.txt | sha256sum -c -)
  install -d -m 0755 /opt/iit-pm/runtime-new
  tar -xJf "${temp_dir}/${node_file}" -C /opt/iit-pm/runtime-new --strip-components=1
  [[ ! -e "${runtime}" ]] || mv "${runtime}" "/opt/iit-pm/runtime-previous-$(date +%Y%m%d%H%M%S)"
  mv /opt/iit-pm/runtime-new "${runtime}"
  trap - EXIT
  cleanup
fi

cp -a "${release}" "${target}"
chown -R root:root "${target}"
export PATH="${runtime}/bin:${PATH}"
"${runtime}/bin/corepack" enable --install-directory "${runtime}/bin"
"${runtime}/bin/corepack" prepare pnpm@11.19.0 --activate
(cd "${target}" && "${runtime}/bin/pnpm" install --prod --frozen-lockfile --filter @iit/server...)

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ ! -f /opt/iit-pm/.env ]]; then
  read -rsp "请输入公司通用登录密码（所有成员共用，至少8位）：" team_password
  echo
  [[ "${#team_password}" -ge 8 ]] || { echo "公司通用登录密码至少8位" >&2; exit 1; }
  {
    echo "NODE_ENV=production"
    echo "PORT=3000"
    echo "DATABASE_PATH=/opt/iit-pm/data/iit-pm.db"
    echo "ATTACHMENT_PATH=/opt/iit-pm/data/attachments"
    echo "TEAM_ACCESS_PASSWORD=${team_password}"
    echo "SESSION_DAYS=30"
    echo "COOKIE_SECURE=false"
  } >/opt/iit-pm/.env
  unset team_password
  chown root:iitpm /opt/iit-pm/.env
  chmod 0640 /opt/iit-pm/.env
fi

[[ ! -e /opt/iit-pm/current || -L /opt/iit-pm/current ]] || { echo "/opt/iit-pm/current 不是软链接，请人工检查" >&2; exit 1; }
ln -sfn "${target}" /opt/iit-pm/current
install -m 0644 "${script_dir}/iit-pm.service" /etc/systemd/system/iit-pm.service
install -m 0644 "${script_dir}/iit-pm-backup.service" /etc/systemd/system/iit-pm-backup.service
install -m 0644 "${script_dir}/iit-pm-backup.timer" /etc/systemd/system/iit-pm-backup.timer
systemctl daemon-reload
systemctl enable --now iit-pm.service
systemctl enable --now iit-pm-backup.timer

for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null; then
    echo "安装完成。请在阿里云安全组仅向公司出口 IP 开放 TCP 3000，然后访问：http://服务器公网IP:3000"
    exit 0
  fi
  sleep 1
done
systemctl status iit-pm.service --no-pager || true
echo "应用健康检查失败" >&2
exit 1
