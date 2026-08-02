// apps/web/src/routes/_shell.verify.tsx
// Hidden single-channel smoke test ('/verify', inside the AppShell layout) — NOT
// linked from any navigation: an operator tool reached by direct URL that spends REAL
// provider money on every press.
//
// WHY IT EXISTS SEPARATELY FROM /compare-video. That page answers "which channel is
// cheaper" and therefore must stay symmetric and free of provider prose. This one
// answers "does a full-size Seedance 2.0 render actually work end to end", which is a
// different job with different needs:
//   · ONE channel at a time, so a failure has exactly one suspect;
//   · settings PINNED to 15s / 1080p / Seedance 2.0 — the configuration the product
//     actually sells, and no knob that could quietly measure something else;
//   · the provider's RAW terminal envelope on screen, because Segmind's success shape
//     has never been observed and "no video" vs "video under an unread key" are
//     indistinguishable without it — at $5.10 per attempt to guess.
//
// Composition only: behaviour lives in modules/Compare.
import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createFileRoute } from '@tanstack/react-router'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import {
  useVerifyStore,
  VERIFY_DURATION_SECONDS,
  VERIFY_RESOLUTION,
} from 'modules/Compare'
import type { VideoChannelId } from 'modules/Compare'
import { Button } from 'shared/ui'

export const Route = createFileRoute('/_shell/verify')({
  component: VerifyPage,
})

// Channels this page can smoke-test, with what a 15s/1080p run is expected to cost.
// The figures are ESTIMATES from published rates and are labelled as such on screen —
// the panel afterwards shows what the provider actually reported, which for Segmind
// is nothing at all.
const CHANNELS: { id: VideoChannelId; label: string; note: string; estimateUsd: number }[] = [
  { id: 'segmind', label: 'Segmind', note: 'flat $7.00/M', estimateUsd: 5.1 },
  { id: 'kie', label: 'kie.ai', note: '102 кр/с', estimateUsd: 7.65 },
  { id: 'deepinfra', label: 'DeepInfra', note: '$7.70/M', estimateUsd: 5.61 },
]

// NOT exported: route files may only export Route, or the router plugin cannot
// code-split the screen.
function VerifyPage() {
  const { t } = useTranslation()
  const prompt = useVerifyStore((state) => state.prompt)
  const channel = useVerifyStore((state) => state.channel)
  const run = useVerifyStore((state) => state.run)
  const clientMs = useVerifyStore((state) => state.clientMs)
  const setPrompt = useVerifyStore((state) => state.setPrompt)
  const setChannel = useVerifyStore((state) => state.setChannel)
  const start = useVerifyStore((state) => state.start)
  const reset = useVerifyStore((state) => state.reset)

  const isLoading = run.status === 'loading'
  const active = CHANNELS.find((entry) => entry.id === channel) ?? CHANNELS[0]!

  // Ticking stopwatch. Load-bearing rather than decorative: a 15s/1080p render runs
  // minutes, and without a moving number the page reads as hung — which is exactly
  // when an operator reloads and abandons a job that keeps billing.
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  useEffect(() => {
    if (!isLoading) return
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [isLoading])

  // Unmount aborts the REQUEST only — the provider keeps rendering and keeps
  // charging. Said out loud in the copy below rather than implied.
  useEffect(() => {
    return () => useVerifyStore.getState().abort()
  }, [])

  const handleStart = () => {
    setElapsedSeconds(0)
    void start()
  }

  const panel = run.status === 'success' ? run.result.panels[0] : undefined

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <span className="text-xs text-mist-dim">provider smoke test</span>
        <h1 className="text-3xl font-normal text-white">Seedance 2.0 — проверка канала</h1>
        <p className="max-w-2xl text-sm text-mist-dim">
          Один канал, один промпт, фиксированные {VERIFY_DURATION_SECONDS} с /{' '}
          {VERIFY_RESOLUTION}. Показывает не только результат, но и сырой ответ провайдера —
          именно он отвечает на вопрос «а что вообще пришло».
        </p>
        <p className="max-w-2xl text-xs text-amber-200/70">
          Каждый запуск тратит настоящие деньги провайдера (оценка ниже) и НЕ списывает кредиты
          аккаунта. Уход со страницы отменит запрос, но не рендер — он продолжится и будет оплачен.
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-lg border border-white/10 p-5">
        <textarea
          value={prompt}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value)}
          aria-label="Prompt"
          placeholder="Опишите клип — ровно этот текст уйдёт в модель…"
          rows={4}
          disabled={isLoading}
          className="w-full resize-y rounded-lg border border-white/10 bg-transparent p-4 text-sm text-white placeholder:text-mist-dim focus:border-white/30 focus:outline-none disabled:opacity-50"
        />
        <p className="font-mono text-xs text-mist-dim">
          {prompt.length} / 2000 символов
        </p>

        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="channel" className="text-xs text-mist-dim">
              Канал
            </label>
            <select
              id="channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value as VideoChannelId)}
              disabled={isLoading}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none disabled:opacity-50"
            >
              {CHANNELS.map((entry) => (
                <option key={entry.id} value={entry.id} className="bg-black">
                  {entry.label} — {entry.note}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-mist-dim">Настройки (зафиксированы)</span>
            <p className="font-mono text-sm tabular-nums text-white">
              Seedance 2.0 · {VERIFY_DURATION_SECONDS} с · {VERIFY_RESOLUTION}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-mist-dim">Ожидаемое списание</span>
            <p className="font-mono text-sm tabular-nums text-white">
              ≈${active.estimateUsd.toFixed(2)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleStart}
              disabled={prompt.trim().length < 2}
              isLoading={isLoading}
            >
              {isLoading ? 'Рендерим…' : `Запустить на ${active.label}`}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={isLoading}>
              Сбросить
            </Button>
          </div>
        </div>
      </div>

      {/* LOADING */}
      {isLoading ? (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-8 text-center">
          <p className="font-mono text-3xl tabular-nums text-white">{elapsedSeconds} с</p>
          <p className="text-sm text-mist-dim">
            15 секунд в 1080p — это обычно 2–5 минут. Ответ придёт, когда канал закончит.
          </p>
        </div>
      ) : null}

      {/* EMPTY */}
      {run.status === 'empty' ? (
        <p className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-mist-dim">
          Введите промпт и запустите — здесь появится результат и сырой ответ канала.
        </p>
      ) : null}

      {/* ERROR — request level. Localized copy from the shared code→i18n layer,
          calm styling, role="status": a refused run is an expected outcome here. */}
      {run.status === 'error' ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-5">
          <p role="status" className="text-sm text-mist-dim">
            {t(errorCodeMessageKey(run.errorCode))}
          </p>
          <Button variant="ghost" onClick={handleStart}>
            Повторить
          </Button>
        </div>
      ) : null}

      {/* DATA */}
      {run.status === 'success' && panel ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 rounded-lg border border-white/10 p-5">
            <header className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium text-white">{panel.label}</h2>
              <span
                className={`font-mono text-xs ${
                  panel.status === 'success' ? 'text-emerald-300' : 'text-mist-dim'
                }`}
              >
                {panel.status}
              </span>
            </header>

            {panel.videoUrl ? (
              <video
                src={panel.videoUrl}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full rounded border border-white/10 bg-black"
              />
            ) : null}

            {panel.status === 'error' ? (
              <p
                role="status"
                className="rounded border border-white/10 bg-white/[0.03] p-3 text-sm text-mist-dim"
              >
                {t(errorCodeMessageKey(panel.errorCode))}
              </p>
            ) : null}

            {panel.status === 'success' && !panel.videoUrl ? (
              <p
                role="status"
                className="rounded border border-white/10 bg-white/[0.03] p-3 text-sm text-mist-dim"
              >
                Канал отчитался об успехе, но файла в ответе нет. Смотрите сырой ответ ниже —
                скорее всего URL лежит под неизвестным нам ключом. Деньги при этом списаны.
              </p>
            ) : null}

            <dl className="flex flex-col gap-2 border-t border-white/10 pt-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-mist-dim">Списано провайдером</dt>
                <dd className="font-mono tabular-nums text-white">
                  {panel.costUsd === null ? (
                    <span className="text-mist-dim">сумма не указана в ответе</span>
                  ) : (
                    `$${panel.costUsd.toFixed(4)}`
                  )}
                </dd>
              </div>
              {panel.creditsConsumed !== null ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-mist-dim">Кредитов</dt>
                  <dd className="font-mono tabular-nums text-white">{panel.creditsConsumed}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-mist-dim">Время на сервере</dt>
                <dd className="font-mono tabular-nums text-white">
                  {(panel.durationMs / 1000).toFixed(1)} с
                </dd>
              </div>
              {clientMs !== null ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-mist-dim">Время в браузере</dt>
                  <dd className="font-mono tabular-nums text-white">
                    {(clientMs / 1000).toFixed(1)} с
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          {/* THE POINT OF THIS PAGE. Collapsed by default so it never competes with
              the result, but present on every run: it is the only artefact that turns
              a $5 render into knowledge about the channel's response shape. */}
          {panel.rawResponse ? (
            <details className="rounded-lg border border-white/10 p-5">
              <summary className="cursor-pointer text-sm text-white">
                Сырой ответ канала
              </summary>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-black/40 p-4 font-mono text-xs text-mist-dim">
                {formatRaw(panel.rawResponse)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </main>
  )
}

// Pretty-print when the body parses, fall back to the original string when it does
// not. A provider that answers with plain text is itself a finding — swallowing it
// behind a parse error would hide exactly what this page was built to reveal.
function formatRaw(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
