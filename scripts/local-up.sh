#!/usr/bin/env bash
# KartPlan'ı kendi bilgisayarında tek komutla çalıştırır (macOS, Linux, Windows'ta WSL).
#   ./scripts/local-up.sh
# Gerekenler: Docker (Desktop), Node 22+, pnpm (corepack), uv. Ctrl+C ile durur; veritabanı
# konteynerleri arka planda kalır (kapatmak için: docker compose down).
set -euo pipefail

cd "$(dirname "$0")/.."

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

step "Araçlar denetleniyor"
command -v docker >/dev/null || fail "Docker yok: https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || fail "Docker çalışmıyor: Docker Desktop'ı aç ve yeniden dene."
command -v node >/dev/null || fail "Node yok: https://nodejs.org (22 ya da üstü)"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || fail "Node 22 ya da üstü gerekli."
command -v pnpm >/dev/null || { corepack enable >/dev/null 2>&1 && command -v pnpm >/dev/null; } ||
  fail "pnpm yok: corepack enable (ya da npm i -g pnpm)"
command -v uv >/dev/null || fail "uv yok: https://docs.astral.sh/uv/getting-started/installation/"
command -v openssl >/dev/null || fail "openssl yok."

step "Bağımlılıklar kuruluyor"
pnpm install
(cd services/engine && uv python install 3.12 >/dev/null && uv sync)

step "Ortam dosyası (.env)"
[ -f .env ] || { cp .env.example .env; echo ".env oluşturuldu."; }
# Boş bırakılmış yerel anahtarları doldurur; dolu olanlara dokunmaz.
fill() {
  local key="$1" value="$2"
  if grep -qE "^${key}=\"?\"?$" .env; then
    local tmp
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"=\""v"\""} {print}' .env >"$tmp" && mv "$tmp" .env
    echo "$key üretildi."
  elif ! grep -qE "^${key}=" .env; then
    printf '%s="%s"\n' "$key" "$value" >>.env
    echo "$key eklendi."
  fi
}
fill AUTH_SECRET "$(openssl rand -base64 32)"
fill ENGINE_TOKEN "$(openssl rand -hex 32)"
fill CRON_SECRET "$(openssl rand -hex 32)"
if grep -qE '^VAPID_PUBLIC_KEY="?"?$' .env || ! grep -qE '^VAPID_PUBLIC_KEY=' .env; then
  keys="$(pnpm --silent --filter @kartplan/web exec web-push generate-vapid-keys --json)"
  fill VAPID_PUBLIC_KEY "$(node -e 'console.log(JSON.parse(process.argv[1]).publicKey)' "$keys")"
  fill VAPID_PRIVATE_KEY "$(node -e 'console.log(JSON.parse(process.argv[1]).privateKey)' "$keys")"
fi
fill VAPID_SUBJECT "mailto:yerel@kartplan.local"

step "Veritabanı, Redis ve Mailpit (Docker)"
docker compose up -d --wait

step "Migration ve örnek katalog"
pnpm db:deploy
pnpm db:seed

step "Uygulama başlıyor"
cat <<'EOF'
  Uygulama : http://localhost:3000
  E-postalar (giriş bağlantısı buraya düşer): http://localhost:8025
  Motor    : http://localhost:8000/health
  Admin olmak için .env'de SEED_ADMIN_EMAIL'e kendi e-postanı yazıp pnpm db:seed çalıştır.
  Durdurmak için Ctrl+C.
EOF

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
pnpm engine:dev &
pids+=($!)
pnpm --filter @kartplan/web dev &
pids+=($!)
wait
