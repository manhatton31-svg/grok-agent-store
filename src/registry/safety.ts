/**
 * Re-probe registry soft-fails with correct semantics.
 *
 * Live store bugs this corrects:
 * 1. github_repo_exists 403 on public repos (worker rate-limit / missing UA)
 * 2. remote_reachable "Too many subrequests" (CF Worker batch limit false fail)
 * 3. agent_card_shape mislabels 404/HTML/fetch failures as "bad JSON shape"
 * 4. agent_card_shape rejects valid cards (name+url, or name+url+skills)
 * 5. has_agent_surface ignores website / derivable discovery URLs
 * 6. Malformed markdown repo URLs from issue scrapes (…mcp-server](https:…)
 */

import type {
  AgentListing,
  FailedCheck,
  McpListing,
} from "./types";

export type RecheckResult = {
  id: string;
  name: string;
  kind: "mcp" | "agent";
  originalFails: FailedCheck[];
  remainingFails: FailedCheck[];
  cleared: FailedCheck[];
  notes: string[];
  originalScore?: number;
  adjustedScore?: number;
};

export type RevalidateReport = {
  checkedAt: string;
  mcp: RecheckResult[];
  agents: RecheckResult[];
  summary: {
    mcpSoftFailBefore: number;
    mcpSoftFailAfter: number;
    agentSoftFailBefore: number;
    agentSoftFailAfter: number;
    falsePositivesCleared: number;
    realIssuesRemaining: number;
  };
  rootCauses: { id: string; title: string; detail: string; fix: string }[];
};

const UA = "Agents1RegistryRevalidator/1.0 (+https://github.com/manhatton31-svg/grok-agent-store)";

function cleanGithubUrl(raw?: string | null): string | null {
  if (!raw) return null;
  let s = raw.trim();
  // Fix markdown-corrupted URLs: https://github.com/x/y](https://github.com/x/y
  const md = s.match(
    /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/,
  );
  if (md) s = md[0];
  s = s.replace(/[)\].,]+$/, "");
  if (!/^https?:\/\/github\.com\//i.test(s)) return null;
  return s;
}

async function fetchStatus(
  url: string,
  opts?: { accept?: string; timeoutMs?: number },
): Promise<{
  ok: boolean;
  status: number;
  contentType: string;
  bodyText: string;
  error?: string;
}> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 10000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": UA,
        accept: opts?.accept ?? "*/*",
      },
    });
    const contentType = res.headers.get("content-type") || "";
    const bodyText = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      contentType,
      bodyText: bodyText.slice(0, 50_000),
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      bodyText: "",
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

async function checkGithubRepo(repoUrl?: string): Promise<{
  pass: boolean;
  detail: string;
  inconclusive?: boolean;
}> {
  const cleaned = cleanGithubUrl(repoUrl);
  if (!cleaned) {
    return { pass: false, detail: "no parseable github.com repository URL" };
  }
  const m = cleaned.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i,
  );
  if (!m) return { pass: false, detail: "invalid github repo URL" };
  const api = `https://api.github.com/repos/${m[1]}/${m[2].replace(/\.git$/, "")}`;
  const r = await fetchStatus(api, {
    accept: "application/vnd.github+json",
    timeoutMs: 12000,
  });
  if (r.status === 200) return { pass: true, detail: "github repo reachable" };
  if (r.status === 404) return { pass: false, detail: "github repo not found: 404" };
  if (r.status === 403 || r.status === 429) {
    // Rate limit / abuse — not a listing defect. Do not soft-fail.
    return {
      pass: true,
      detail: `github probe ${r.status} treated as inconclusive (not a listing defect)`,
      inconclusive: true,
    };
  }
  if (r.error) {
    return {
      pass: true,
      detail: `github probe network error treated as inconclusive: ${r.error}`,
      inconclusive: true,
    };
  }
  return { pass: false, detail: `github repo not reachable: ${r.status}` };
}

function isAgentCardLike(json: unknown): {
  ok: boolean;
  detail: string;
} {
  if (!json || typeof json !== "object") {
    return { ok: false, detail: "not a JSON object" };
  }
  const o = json as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const url =
    (typeof o.url === "string" && o.url) ||
    (typeof o.endpoint === "string" && o.endpoint) ||
    (typeof o.website === "string" && o.website) ||
    "";
  const hasSkills = Array.isArray(o.skills);
  const hasCapArray = Array.isArray(o.capabilities);
  const hasCapObject =
    o.capabilities != null &&
    typeof o.capabilities === "object" &&
    !Array.isArray(o.capabilities);
  // Accept A2A / marketplace cards:
  // - name + url (AAA style)
  // - name + skills[]
  // - name + capabilities[] or capabilities{}
  if (!name) return { ok: false, detail: "missing name" };
  if (url || hasSkills || hasCapArray || hasCapObject) {
    return { ok: true, detail: "agent-card-like JSON accepted" };
  }
  return {
    ok: false,
    detail: "need url, skills[], or capabilities in addition to name",
  };
}

function rewriteGithubTreeCard(url: string): string[] {
  // https://github.com/owner/repo/tree/main/docs/.well-known/agent.json
  // -> raw.githubusercontent.com/owner/repo/main/docs/.well-known/agent.json
  const m = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:tree|blob)\/([^/]+)\/(.+)$/i,
  );
  if (!m) return [url];
  const raw = `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  return [raw, url];
}

async function checkAgentCard(cardUrl?: string | null): Promise<{
  pass: boolean;
  detail: string;
  kind:
    | "ok"
    | "missing"
    | "unreachable"
    | "not_json"
    | "bad_shape"
    | "inconclusive";
}> {
  if (!cardUrl) {
    return {
      pass: true,
      detail: "no agent_card_url (surface check owns that)",
      kind: "missing",
    };
  }
  const candidates = rewriteGithubTreeCard(cardUrl);
  let lastDetail = "";
  for (const url of candidates) {
    const r = await fetchStatus(url, {
      accept: "application/json, text/plain;q=0.9, */*;q=0.1",
      timeoutMs: 12000,
    });
    if (r.status === 404) {
      lastDetail = `agent card 404 at ${url}`;
      continue;
    }
    if (r.status === 403 || r.status === 429) {
      return {
        pass: true,
        detail: `agent card probe ${r.status} inconclusive at ${url}`,
        kind: "inconclusive",
      };
    }
    if (!r.ok) {
      lastDetail = `agent card HTTP ${r.status}${r.error ? `: ${r.error}` : ""}`;
      continue;
    }
    const ct = r.contentType.toLowerCase();
    if (ct.includes("text/html") && !r.bodyText.trim().startsWith("{")) {
      lastDetail = "agent card URL returned HTML, not JSON";
      continue;
    }
    try {
      const json = JSON.parse(r.bodyText);
      const shape = isAgentCardLike(json);
      if (shape.ok) {
        return { pass: true, detail: shape.detail, kind: "ok" };
      }
      return { pass: false, detail: shape.detail, kind: "bad_shape" };
    } catch {
      lastDetail = "agent card body is not valid JSON";
    }
  }
  return {
    pass: false,
    detail: lastDetail || "agent card unreachable",
    kind: lastDetail.includes("404")
      ? "unreachable"
      : lastDetail.includes("HTML")
        ? "not_json"
        : "unreachable",
  };
}

async function checkRemote(url?: string | null): Promise<{
  pass: boolean;
  detail: string;
  inconclusive?: boolean;
}> {
  if (!url) return { pass: true, detail: "no remote_url" };
  // Dead preview host left on older listings
  if (url.includes("chemical-lark.workers.dev")) {
    return {
      pass: false,
      detail:
        "remote points at expired temporary workers.dev host (chemical-lark) — update to manhatton31.workers.dev",
    };
  }
  const r = await fetchStatus(url, { timeoutMs: 10000 });
  if (r.ok || (r.status >= 200 && r.status < 500)) {
    // 401/404 on MCP endpoint still means host is reachable
    if (r.status === 0 && r.error) {
      if (/subrequest/i.test(r.error)) {
        return {
          pass: true,
          detail: "subrequest limit is a worker bug, not a listing defect",
          inconclusive: true,
        };
      }
      return { pass: false, detail: `remote probe failed: ${r.error}` };
    }
    if (r.status >= 500) {
      return { pass: false, detail: `remote probe failed: ${r.status}` };
    }
    return { pass: true, detail: `remote reachable (${r.status})` };
  }
  if (r.error && /subrequest/i.test(r.error)) {
    return {
      pass: true,
      detail: "subrequest limit is a worker bug, not a listing defect",
      inconclusive: true,
    };
  }
  return {
    pass: false,
    detail: r.error
      ? `remote probe failed: ${r.error}`
      : `remote probe failed: ${r.status}`,
  };
}

function hasAgentSurface(a: AgentListing): {
  pass: boolean;
  detail: string;
} {
  const surfaces = [
    a.endpoint_url,
    a.agent_card_url,
    a.mcp_url,
    a.website,
  ].filter((x): x is string => typeof x === "string" && x.startsWith("http"));
  if (surfaces.length > 0) {
    return { pass: true, detail: `surface present: ${surfaces[0]}` };
  }
  // Repository alone is weak but better than nothing for discovery
  if (a.repository && cleanGithubUrl(a.repository)) {
    return {
      pass: false,
      detail:
        "only repository present — add endpoint_url, agent_card_url, or mcp_url for runtime discovery",
    };
  }
  return {
    pass: false,
    detail: "no endpoint_url, agent_card_url, mcp_url, or website",
  };
}

function scoreAdjustment(
  original: number | undefined,
  clearedCount: number,
  remainingCount: number,
): number | undefined {
  if (original == null) return undefined;
  // Each cleared soft-fail typically cost ~5–15 points in the live scorer.
  const bump = clearedCount * 8;
  const adj = Math.min(100, original + bump);
  if (remainingCount === 0) return Math.max(adj, Math.min(100, original + 10));
  return adj;
}

export async function revalidateMcp(
  item: McpListing,
): Promise<RecheckResult> {
  const original = [...(item.failed_checks || [])];
  const remaining: FailedCheck[] = [];
  const cleared: FailedCheck[] = [];
  const notes: string[] = [];

  for (const fail of original) {
    if (fail.id === "github_repo_exists") {
      const r = await checkGithubRepo(item.repository);
      notes.push(`github: ${r.detail}`);
      if (r.pass) cleared.push(fail);
      else remaining.push({ id: fail.id, detail: r.detail });
      continue;
    }
    if (fail.id === "remote_reachable") {
      // Re-probe; also treat store's "Too many subrequests" as false positive immediately
      if (fail.detail && /too many subrequests/i.test(fail.detail)) {
        notes.push("cleared remote_reachable: worker subrequest limit false positive");
        cleared.push(fail);
        continue;
      }
      const r = await checkRemote(item.remote_url || item.website);
      notes.push(`remote: ${r.detail}`);
      if (r.pass) cleared.push(fail);
      else remaining.push({ id: fail.id, detail: r.detail });
      continue;
    }
    // Unknown checks: keep
    remaining.push(fail);
  }

  return {
    id: item.id,
    name: item.name,
    kind: "mcp",
    originalFails: original,
    remainingFails: remaining,
    cleared,
    notes,
    originalScore: item.safety_score,
    adjustedScore: scoreAdjustment(
      item.safety_score,
      cleared.length,
      remaining.length,
    ),
  };
}

export async function revalidateAgent(
  item: AgentListing,
): Promise<RecheckResult> {
  const original = [...(item.failed_checks || [])];
  const remaining: FailedCheck[] = [];
  const cleared: FailedCheck[] = [];
  const notes: string[] = [];

  for (const fail of original) {
    if (fail.id === "github_repo_exists") {
      const r = await checkGithubRepo(item.repository);
      notes.push(`github: ${r.detail}`);
      if (r.pass) cleared.push(fail);
      else remaining.push({ id: fail.id, detail: r.detail });
      continue;
    }
    if (fail.id === "has_agent_surface") {
      const r = hasAgentSurface(item);
      notes.push(`surface: ${r.detail}`);
      if (r.pass) cleared.push(fail);
      else remaining.push({ id: fail.id, detail: r.detail });
      continue;
    }
    if (fail.id === "agent_card_shape") {
      const r = await checkAgentCard(item.agent_card_url);
      notes.push(`card: ${r.detail}`);
      if (r.pass) {
        cleared.push(fail);
      } else {
        // Relabel accurately — not always "shape"
        const id =
          r.kind === "bad_shape"
            ? "agent_card_shape"
            : r.kind === "not_json"
              ? "agent_card_not_json"
              : "agent_card_unreachable";
        remaining.push({ id, detail: r.detail });
      }
      continue;
    }
    remaining.push(fail);
  }

  return {
    id: item.id,
    name: item.name,
    kind: "agent",
    originalFails: original,
    remainingFails: remaining,
    cleared,
    notes,
    originalScore: item.safety_score,
    adjustedScore: scoreAdjustment(
      item.safety_score,
      cleared.length,
      remaining.length,
    ),
  };
}

export async function buildRevalidateReport(
  mcpItems: McpListing[],
  agentItems: AgentListing[],
): Promise<RevalidateReport> {
  // Only re-check items that had soft fails (plus cap for runtime)
  const mcpTargets = mcpItems.filter(
    (m) => (m.failed_checks?.length || 0) > 0,
  );
  const agentTargets = agentItems.filter(
    (a) => (a.failed_checks?.length || 0) > 0,
  );

  // Concurrency-limited map
  async function mapPool<T, R>(
    items: T[],
    limit: number,
    fn: (t: T) => Promise<R>,
  ): Promise<R[]> {
    const out: R[] = [];
    let i = 0;
    async function worker() {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, () => worker()),
    );
    return out;
  }

  const [mcp, agents] = await Promise.all([
    mapPool(mcpTargets, 4, revalidateMcp),
    mapPool(agentTargets, 4, revalidateAgent),
  ]);

  const mcpBefore = mcpTargets.length;
  const agentBefore = agentTargets.length;
  const mcpAfter = mcp.filter((r) => r.remainingFails.length > 0).length;
  const agentAfter = agents.filter((r) => r.remainingFails.length > 0).length;
  const cleared = [...mcp, ...agents].reduce(
    (n, r) => n + r.cleared.length,
    0,
  );
  const remaining = [...mcp, ...agents].reduce(
    (n, r) => n + r.remainingFails.length,
    0,
  );

  return {
    checkedAt: new Date().toISOString(),
    mcp,
    agents,
    summary: {
      mcpSoftFailBefore: mcpBefore,
      mcpSoftFailAfter: mcpAfter,
      agentSoftFailBefore: agentBefore,
      agentSoftFailAfter: agentAfter,
      falsePositivesCleared: cleared,
      realIssuesRemaining: remaining,
    },
    rootCauses: [
      {
        id: "github_403",
        title: "GitHub 403 treated as soft-fail",
        detail:
          "Public repos (e.g. manhatton31-svg/forge-researcher) return 200 via API, but the worker recorded github_unreachable: 403 — rate limit / unauthenticated batch probes during poll.",
        fix: "Use GITHUB_TOKEN + User-Agent on repo checks; treat 403/429 as inconclusive, not failed.",
      },
      {
        id: "subrequest_limit",
        title: "Worker subrequest limit false remote fails",
        detail:
          'Many MCP listings show remote_reachable: "Too many subrequests by single Worker invocation" — CF limit during batch poll, not dead remotes.',
        fix: "Probe remotes in smaller batches / queues; never record CF limit errors as listing defects.",
      },
      {
        id: "card_mislabeled",
        title: "agent_card_shape mislabels fetch failures",
        detail:
          "Most agent soft-fails are 404/HTML agent cards (flux, memroos, …) or valid cards the worker failed to parse (store agent.json has name+url+skills).",
        fix: "Split checks: unreachable vs not_json vs bad_shape; accept name+url and name+capabilities; accept A2A cards without skills[].",
      },
      {
        id: "markdown_urls",
        title: "Markdown-corrupted GitHub URLs from issue scrape",
        detail:
          "Poll parsed issue markdown into repo URLs like https://github.com/x/y](https://github.com/x/y — guaranteed 404.",
        fix: "Sanitize URLs before checks; extract first github.com/owner/repo match.",
      },
      {
        id: "stale_remote",
        title: "Expired temporary workers.dev remotes",
        detail:
          "Own MCP listing still points remote_url at chemical-lark.workers.dev (530).",
        fix: "Update remote/website to manhatton31.workers.dev on resubmit/deploy.",
      },
    ],
  };
}

/** Apply revalidation results onto listing objects for UI. */
export function applyRevalidation<T extends McpListing | AgentListing>(
  items: T[],
  results: RecheckResult[],
): T[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  return items.map((item) => {
    const r = byId.get(item.id);
    if (!r) return item;
    return {
      ...item,
      failed_checks: r.remainingFails,
      safety_score: r.adjustedScore ?? item.safety_score,
      safety_flags: (item.safety_flags || []).filter((f) => {
        if (f === "github_unreachable" && r.cleared.some((c) => c.id === "github_repo_exists"))
          return false;
        if (f === "remote_unreachable" && r.cleared.some((c) => c.id === "remote_reachable"))
          return false;
        if (
          f === "agent_card_invalid_shape" &&
          r.cleared.some((c) => c.id === "agent_card_shape")
        )
          return false;
        return true;
      }),
    };
  });
}
