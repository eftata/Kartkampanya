# 0004 — Python motoru: FastAPI, paylaşılan anahtar, uv

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-14

## Bağlam

Optimizasyon (OR-Tools CP-SAT) ve kampanya veri hattı Python'da çalışacak. Motor yalnızca web
sunucusu tarafından çağrılır ve dışarı açılmaz (ROADMAP → API sözleşmesi).

## Karar

- Python **3.12** (`requires-python = ">=3.12,<3.13"`, `.python-version`), bağımlılıklar **uv** ve
  `uv.lock` ile. pnpm/turbo dışında; kökte `pnpm engine:dev` ve `pnpm engine:check` kısayolları var.
- FastAPI; `/health` kimliksiz, diğer her uç `ENGINE_TOKEN` ile `Authorization: Bearer` ister.
  Karşılaştırma `secrets.compare_digest` ile. Anahtar tanımlı değilse korumalı uçlar **503** döner;
  yanlış yapılandırma motoru açık bırakmaz.
- OpenAPI ve `/docs` kapalı (iç servis; sözleşmenin kaynağı `packages/shared`).
- Kalite: ruff (bandit `S` kuralları dahil), `mypy --strict`, pytest. Türkçe yorumlar için ruff'ın
  `allowed-confusables` listesine `ı` eklendi.
- Test istemcisi için Starlette'in önerdiği `httpx2` kullanılır (`httpx` ile kullanım deprecated).
- Docker: `python:3.12-slim` üzerinde çok aşamalı build; yalnızca üretim bağımlılıkları ve
  düzenlenemez kurulum, root olmayan kullanıcı, `PORT` ortam değişkeni (Railway/Fly), HEALTHCHECK.

## Sonuçlar

- Yeni uçlar `engine/api.py` içindeki `protected` router'ına eklenir; ayrıca yetki kodu yazılmaz.
- OR-Tools Sprint 4'te, LLM istemcisi Sprint 2'de bağımlılık olarak eklenecek.
- Docker imajı bu oturumda derlenemedi (ortamda Docker daemon yok); kurulum adımları imajdaki
  komutlarla birebir yerelde doğrulandı. İlk gerçek build CI/deploy oturumunda yapılmalı.
