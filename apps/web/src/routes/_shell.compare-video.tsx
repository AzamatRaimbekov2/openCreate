// apps/web/src/routes/_shell.compare-video.tsx
// Hidden cost-verification page ('/compare-video', inside the AppShell layout) —
// NOT linked from any navigation on purpose: it is an operator tool reached by
// direct URL that spends REAL provider money on every run.
//
// WHY IT EXISTS. "Which Seedance channel is cheaper" kept getting answered from
// rate cards, and rate cards lie in one specific way: every provider publishes two
// prices per resolution ("with video input", billed over input+output duration,
// and "no video input", billed over output only). We are always on the no-video
// row; comparison articles quote the other one; the conclusion inverts. kie.ai
// additionally advertises a ~32% discount measured against FAL's price, while
// DeepInfra resells ByteDance's own list — so the two discounts are not comparable
// at all. This page settles it with two receipts instead of two spreadsheets.
//
// Composition only: form + one VideoCostPanel per channel; behavior lives in
// modules/Compare.
import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createFileRoute } from '@tanstack/react-router'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import {
  estimateRunCost,
  useVideoCompareStore,
  VIDEO_DURATIONS,
  VIDEO_MODELS,
  VIDEO_RESOLUTIONS,
  VideoCostPanel,
} from 'modules/Compare'
import type { VideoModelId, VideoResolution } from 'modules/Compare'
import { Button } from 'shared/ui'

export const Route = createFileRoute('/_shell/compare-video')({
  component: CompareVideoPage,
})

// NOT exported: route files may only export Route, or the router plugin cannot
// code-split the screen.
function CompareVideoPage() {
  const { t } = useTranslation()
  const prompt = useVideoCompareStore((state) => state.prompt)
  const durationSeconds = useVideoCompareStore((state) => state.durationSeconds)
  const resolution = useVideoCompareStore((state) => state.resolution)
  const model = useVideoCompareStore((state) => state.model)
  const run = useVideoCompareStore((state) => state.run)
  const setPrompt = useVideoCompareStore((state) => state.setPrompt)
  const setDurationSeconds = useVideoCompareStore((state) => state.setDurationSeconds)
  const setResolution = useVideoCompareStore((state) => state.setResolution)
  const setModel = useVideoCompareStore((state) => state.setModel)
  const start = useVideoCompareStore((state) => state.start)
  const reset = useVideoCompareStore((state) => state.reset)

  const isLoading = run.status === 'loading'
  const estimate = estimateRunCost(model, resolution, durationSeconds)

  // Wall-clock stopwatch for the loading state. Local to the page (pure
  // presentation) and genuinely load-bearing here: a real Seedance render is
  // 60-180s, so without a ticking number the page looks hung and an operator
  // reloads it — abandoning a job that keeps billing.
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  useEffect(() => {
    if (!isLoading) return
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [isLoading])

  // Leaving the page cancels an in-flight run's REQUEST. Note what this does NOT
  // do: the providers keep rendering and keep billing — an HTTP abort is not a
  // refund. Said plainly in the UI copy below rather than implied.
  useEffect(() => {
    return () => useVideoCompareStore.getState().abort()
  }, [])

  const handleStart = () => {
    setElapsedSeconds(0)
    void start()
  }

  const panels = run.status === 'success' ? run.panels : []
  // Cheapest among panels that both SUCCEEDED and stated a figure. A channel that
  // failed is not "free", and one that stated nothing is not "cheapest" — either
  // shortcut would put a winner badge on the wrong pipe.
  const billed = panels.filter((panel) => panel.status === 'success' && panel.costUsd !== null)
  const cheapestCost = billed.length > 0 ? Math.min(...billed.map((p) => p.costUsd ?? 0)) : null

  const runDuration = run.status === 'success' ? run.durationSeconds : durationSeconds
  const spread =
    billed.length === 2 && cheapestCost !== null && cheapestCost > 0
      ? Math.max(...billed.map((p) => p.costUsd ?? 0)) / cheapestCost
      : null

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <span className="text-xs text-mist-dim">cost verification</span>
        <h1 className="text-3xl font-normal text-white">Seedance — какой канал дешевле</h1>
        <p className="max-w-2xl text-sm text-mist-dim">
          Один промпт, одна модель, одинаковые настройки — параллельно через Segmind и kie.ai.
          Показываются не прайсы, а суммы, которые каждый провайдер реально списал за этот запуск.
        </p>
        <p className="max-w-2xl text-xs text-amber-200/70">
          Тратит настоящие деньги провайдеров и НЕ списывает кредиты аккаунта. Segmind сумму в
          ответе не возвращает — его панель честно скажет об этом, а реальную цену придётся
          сверить по балансу в их кабинете.
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-lg border border-white/10 p-5">
        <textarea
          value={prompt}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value)}
          aria-label="Prompt"
          placeholder="Опишите клип — оба канала получат ровно этот текст…"
          rows={3}
          disabled={isLoading}
          className="w-full resize-y rounded-lg border border-white/10 bg-transparent p-4 text-sm text-white placeholder:text-mist-dim focus:border-white/30 focus:outline-none disabled:opacity-50"
        />

        <div className="flex flex-wrap items-end gap-6">
          {/* Model FIRST in the row: it is the biggest lever on what a run costs
              (Seedance 2.0 ≈ 10× 1.5 Pro), so it must be seen before the settings
              that only move the price by a factor of two. */}
          <div className="flex flex-col gap-2">
            <label htmlFor="model" className="text-xs text-mist-dim">
              Модель — на обоих каналах
            </label>
            <select
              id="model"
              value={model}
              onChange={(event) => setModel(event.target.value as VideoModelId)}
              disabled={isLoading}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none disabled:opacity-50"
            >
              {VIDEO_MODELS.map((entry) => (
                <option key={entry.id} value={entry.id} className="bg-black">
                  {entry.label} — {entry.note}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="duration" className="text-xs text-mist-dim">
              Длительность
            </label>
            <select
              id="duration"
              value={durationSeconds}
              onChange={(event) => setDurationSeconds(Number(event.target.value))}
              disabled={isLoading}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none disabled:opacity-50"
            >
              {VIDEO_DURATIONS.map((seconds) => (
                <option key={seconds} value={seconds} className="bg-black">
                  {seconds} с
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="resolution" className="text-xs text-mist-dim">
              Разрешение
            </label>
            <select
              id="resolution"
              value={resolution}
              onChange={(event) => setResolution(event.target.value as VideoResolution)}
              disabled={isLoading}
              className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none disabled:opacity-50"
            >
              {VIDEO_RESOLUTIONS.map((value) => (
                <option key={value} value={value} className="bg-black">
                  {value}
                </option>
              ))}
            </select>
          </div>

          {/* Price BEFORE the button, not after the failure. Three runs died on
              "Credits insufficient" because nothing said that 720p → 1080p multiplies
              the bill by 2.5, and the settings survive a reset (which only clears the
              prompt). An estimate, explicitly labelled — the receipt still comes from
              the provider. */}
          <div className="flex flex-col gap-2">
            <span className="text-xs text-mist-dim">Спишется за прогон (оценка)</span>
            <p className="font-mono text-sm tabular-nums text-white">
              kie ≈{estimate.kieCredits} кр
              <span className="ml-1 text-mist-dim">${estimate.kieUsd.toFixed(3)}</span>
            </p>
            {estimate.segmindUsd > 0 ? (
              <p className="font-mono text-sm tabular-nums text-white">
                Segmind ≈<span className="text-mist-dim">${estimate.segmindUsd.toFixed(3)}</span>
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleStart}
              disabled={prompt.trim().length === 0}
              isLoading={isLoading}
            >
              {isLoading ? 'Считаем…' : 'Запустить'}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={isLoading}>
              Сбросить
            </Button>
          </div>
        </div>
      </div>

      {/* LOADING — the honest version: name the wait, and say what closing the tab
          does and does not stop. */}
      {isLoading ? (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-8 text-center">
          <p className="font-mono text-2xl tabular-nums text-white">{elapsedSeconds} с</p>
          <p className="text-sm text-mist-dim">
            Оба канала рендерят. Обычно 60–180 с; ответ придёт, когда оба закончат.
          </p>
          <p className="text-xs text-mist-dim">
            Уход со страницы отменит только запрос — рендеры продолжатся и будут оплачены.
          </p>
        </div>
      ) : null}

      {/* EMPTY */}
      {run.status === 'empty' ? (
        <p className="rounded-lg border border-dashed border-white/10 p-8 text-center text-sm text-mist-dim">
          Введите промпт и запустите — здесь появятся два чека.
        </p>
      ) : null}

      {/* ERROR — run level (auth, validation, rate limit, network). A CHANNEL
          failure is not this: it arrives inside a successful response as an error
          panel, because a refusal is still a measurement. */}
      {run.status === 'error' ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-5">
          {/* Localized copy from the shared code→i18n layer. It used to print
              `run.error` — an ApiClientError message, i.e. server text — in red.
              Calm styling and role="status": a refused run is an expected outcome
              here, and the operator is looking straight at it. */}
          <p role="status" className="text-sm text-mist-dim">
            {t(errorCodeMessageKey(run.errorCode))}
          </p>
          <Button variant="ghost" onClick={handleStart}>
            Повторить
          </Button>
        </div>
      ) : null}

      {/* DATA */}
      {run.status === 'success' ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-white/10 px-5 py-4 text-sm">
            <span className="text-mist-dim">
              Настройки прогона:{' '}
              <span className="font-mono text-white">
                {run.durationSeconds} с · {run.resolution}
              </span>
            </span>
            {spread !== null ? (
              <span className="text-mist-dim">
                Разрыв:{' '}
                <span className="font-mono text-white">{spread.toFixed(2)}×</span>
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {run.panels.map((panel) => (
              <VideoCostPanel
                key={panel.channel}
                panel={panel}
                isCheapest={
                  cheapestCost !== null &&
                  panel.status === 'success' &&
                  panel.costUsd === cheapestCost &&
                  billed.length > 1
                }
                perSecondUsd={
                  panel.costUsd !== null && runDuration > 0 ? panel.costUsd / runDuration : null
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </main>
  )
}
