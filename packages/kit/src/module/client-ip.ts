/**
 * Resolve the client IP used for per-IP rate-limiting under a config-gated
 * trusted-proxy model.
 *
 * `X-Forwarded-For` is client-controlled and therefore spoofable: anyone who can
 * reach the app can set the header and forge any address. The only inherently
 * trustworthy hop is the **socket peer** (the address of whoever actually opened
 * the TCP connection). `trustedProxyHops` says how many proxies of our own sit
 * in front of the app — i.e. how many rightmost entries of the chain we vouch
 * for. The real client is the entry just to the left of those trusted hops.
 *
 * - `hops <= 0` (default): trust NOTHING from `X-Forwarded-For`. Use the socket
 *   peer. A forged header cannot move the key. When there is no socket address
 *   (in-process / web-fetch test path), fall back to the rightmost forwarded
 *   hop so tests can still exercise per-IP behaviour deterministically.
 * - `hops = N` (behind N trusted proxies/LBs): take the entry `N` from the right
 *   of `[...xff, socket]` — the address the outermost trusted proxy observed.
 *
 * Returns `'anon'` when no address can be determined.
 */
export function resolveClientIp(
  xffHeader: string | null | undefined,
  socketIp: string | null | undefined,
  trustedProxyHops: number,
): string {
  const xff = (xffHeader ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)

  // The address chain as the app sees it: client-claimed forwarded entries
  // (left → right), then the actual socket peer (rightmost, the only hop we did
  // not have to take on faith).
  const chain = socketIp ? [...xff, socketIp] : xff
  if (chain.length === 0)
    return 'anon'

  const hops = Number.isFinite(trustedProxyHops) ? Math.max(0, Math.trunc(trustedProxyHops)) : 0
  const index = chain.length - 1 - hops
  return chain[Math.max(0, index)] ?? 'anon'
}
