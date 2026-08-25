// apps/web/src/modules/Analytics/model/useTelemetry.ts
// Loads the optional cookieless analytics script (ADR analytics §7).
//
// Three rules, all of them about what this must NOT do:
//
//   · Nothing loads unless the deployment configured it. `telemetry: null` is the
//     default, so a fresh deploy makes no third-party request and needs no
//     consent banner.
//   · No user id, email or prompt text is ever passed. Prompts are user content
//     and frequently personal; a URL-path-only integration cannot leak them by
//     accident, which is why this hook has no access to any of it.
//   · The tag is injected exactly once per page load, even under React strict
//     mode's double-effect — a second script means every pageview counted twice.
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PublicConfig } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// Marks the tag we injected. Also the idempotence check: a re-render, a route
// change and strict mode's second effect all find it and do nothing.
const TAG_ID = 'oc-telemetry'

export function useTelemetry() {
  const config = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<PublicConfig>('/api/config'),
    // Deployment configuration does not change while a tab is open.
    staleTime: Infinity,
    // Telemetry is the least important thing on the page: if this request fails,
    // the app must carry on silently rather than retry or surface an error.
    retry: false,
  })

  const telemetry = config.data?.telemetry ?? null

  useEffect(() => {
    if (!telemetry) return
    if (document.getElementById(TAG_ID)) return

    const script = document.createElement('script')
    script.id = TAG_ID
    script.defer = true
    script.src = telemetry.scriptUrl
    // Plausible and Umami both read the site identity off a data attribute.
    // Sending the CONFIGURED domain rather than location.hostname means a preview
    // deployment cannot silently pollute production's numbers.
    script.setAttribute('data-domain', telemetry.siteDomain)
    document.head.appendChild(script)
    // No cleanup: the script is a page-lifetime singleton, and removing it on
    // unmount would let the next mount inject a second one.
  }, [telemetry])
}
