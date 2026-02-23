<!-- ============================================================
     Payment API — Architecture Decision Record
     ADR-0042: Adopt circuit-breaker pattern for payment providers
     Author: platform-team
     Date: 2024-03-01
     Status: Accepted
     ============================================================ -->

# ADR-0042: Circuit-Breaker Pattern for Payment Providers

<!-- Table of contents — update manually when sections change -->
**Contents:** [Context](#context) · [Decision](#decision) · [Consequences](#consequences) · [Runbook](#runbook)

---

## Context

<!-- Why are we writing this? What problem are we solving? -->

The `payment-api` service integrates with three external payment providers: **Stripe**, **Adyen**, and **PayPal**. These providers are third-party SaaS products outside our control. In the past six months we have experienced the following incidents:

<!-- Reference existing post-mortems -->
- **INC-1021** (2023-09-12): Stripe outage — no fallback, 100% of payment requests failed for 23 minutes. Revenue impact: ~€47,000.
- **INC-1089** (2023-11-04): Adyen elevated latency (p99 > 8 s) — cascading thread-pool exhaustion in `payment-api`, caused downstream timeout failures in `order-service`. MTTR: 41 minutes.
- **INC-1134** (2024-01-28): PayPal authentication endpoint flap — repeated retries amplified load, causing a self-inflicted DDoS on the provider. Account temporarily suspended.

The current retry logic uses a simple exponential back-off with jitter, but has no mechanism to:

1. Stop sending requests to a degraded provider before timeouts accumulate.
2. Automatically probe whether the provider has recovered.
3. Route traffic to a backup provider during an outage.

Without a circuit-breaker the service is vulnerable to **cascading failures** and **thundering-herd** retry storms.

---

## Decision

<!-- What are we going to do? Be specific. -->

We will implement the **Circuit Breaker** pattern (as described in [Release It!, chapter 5](https://pragprog.com/titles/mnee2/release-it-second-edition/)) for all outbound calls to payment providers.

### State machine

```
          failure_threshold exceeded
CLOSED ──────────────────────────────► OPEN
  ▲                                      │
  │    probe succeeds                    │  timeout_seconds elapsed
  │                                      ▼
  └────────────────────────── HALF-OPEN ◄─┘
           success_threshold
```

<!-- Explain each state clearly -->

| State | Behaviour |
|---|---|
| **CLOSED** | All requests pass through. Failures are counted. |
| **OPEN** | All requests fail immediately (no network call). Returns `503 Provider Unavailable`. |
| **HALF-OPEN** | A limited number of probe requests are allowed. If they succeed the breaker closes; if they fail it reopens. |

### Configuration (per provider)

<!-- These values were chosen based on post-mortem data from INC-1021 and INC-1089 -->

```json
{
  "circuit_breaker": {
    "failure_threshold":    3,
    "success_threshold":    1,
    "timeout_seconds":      30,
    "half_open_max_calls":  1
  }
}
```

### Fallback strategy

<!-- Priority order when the primary provider is OPEN -->

When a provider circuit is `OPEN`:

1. **Stripe (primary)** → fall back to **Adyen** if `adyen.enabled = true`, otherwise return `503`.
2. **Adyen (primary)** → fall back to **Stripe** if `stripe.enabled = true`, otherwise return `503`.
3. **PayPal** → no fallback; return `503` immediately (PayPal is only used for PayPal-wallet transactions).

Fallback routing is controlled by the `payment_providers.fallback_order` configuration key.

### Metrics and alerting

<!-- What signals will we emit? -->

The following CloudWatch metrics will be emitted per provider:

| Metric | Unit | Alarm threshold |
|---|---|---|
| `circuit_breaker.state_changes` | Count | Any transition to OPEN |
| `circuit_breaker.rejected_requests` | Count | > 10 in 60 s |
| `circuit_breaker.probe_attempts` | Count | informational |
| `provider.error_rate` | Percent | > 5% over 5 min |
| `provider.p99_latency_ms` | Milliseconds | > 2000 ms |

Alarms will notify the `#payments-oncall` PagerDuty escalation policy.

---

## Consequences

<!-- What are the trade-offs? Be honest. -->

### Positive

- Prevents cascading failures by failing fast when a provider is degraded.
- Reduces mean time to recovery (MTTR) by automatically probing for recovery.
- Protects providers from thundering-herd retries (addresses the PayPal suspension in INC-1134).
- Provides clear observability into provider health via state-change metrics.

### Negative

- Adds complexity to the `payment-api` codebase — teams must understand the state machine.
- Misconfigured thresholds could cause the breaker to open too aggressively (false positives) or too slowly (missing real outages).
- Fallback providers may have different API contracts — the abstraction layer must handle translation.

### Risks

<!-- What could go wrong after we ship this? -->

- **Threshold tuning** is critical. We will run in shadow mode (metrics only, no actual circuit opening) for two weeks before enabling the breaker in production.
- **Stateless vs. stateful**: The current implementation is in-process (per-pod state). During a rolling deploy, a pod restart resets the breaker to `CLOSED`. We will revisit distributed state (Redis-backed) in a follow-up ADR if needed.

---

## Runbook

<!-- How do operators interact with the circuit breaker? -->

### Check current state

```bash
# Via the management API (internal only)
curl -s http://payment-api.payments.svc.cluster.local/admin/circuit-breakers | jq .

# Expected output:
# {
#   "stripe": { "state": "CLOSED", "failure_count": 0 },
#   "adyen":  { "state": "CLOSED", "failure_count": 0 },
#   "paypal": { "state": "CLOSED", "failure_count": 0 }
# }
```

### Force-reset a breaker (emergency only)

```bash
# Reset the Stripe breaker to CLOSED (use with caution — ensure upstream is healthy first)
curl -X POST http://payment-api.payments.svc.cluster.local/admin/circuit-breakers/stripe/reset
```

### Disable circuit breaker for a provider (canary / load test)

```bash
# Set via ConfigMap — will be reloaded without a pod restart
kubectl patch configmap payment-api-config -n payments \
  --patch '{"data": {"circuit_breaker_enabled": "false"}}'
```

---

## References

<!-- External links and internal docs -->

- [Release It! — Michael Nygard, Chapter 5: Stability Patterns](https://pragprog.com/titles/mnee2/release-it-second-edition/)
- [Martin Fowler — Circuit Breaker pattern](https://martinfowler.com/bliki/CircuitBreaker.html "Circuit Breaker")
- [INC-1021 Post-mortem](https://wiki.internal/incidents/1021)
- [INC-1089 Post-mortem](https://wiki.internal/incidents/1089)
- [INC-1134 Post-mortem](https://wiki.internal/incidents/1134)
- [payment-api configuration reference](https://wiki.internal/payment-api/config)
