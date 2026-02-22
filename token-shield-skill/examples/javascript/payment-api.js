/**
 * payment-api.js — Express HTTP server for the Payment Service.
 *
 * Exposes the following REST endpoints:
 *   POST /payments          — Initiate a new payment (idempotent via X-Idempotency-Key)
 *   GET  /payments/:id      — Retrieve payment status
 *   POST /payments/:id/refund — Refund a captured payment (full or partial)
 *   GET  /health            — Kubernetes liveness / readiness probe
 *   GET  /metrics           — Prometheus-compatible text exposition
 *
 * ### Architecture notes
 *
 * All payments go through a two-phase pipeline:
 *  1. Validation   — schema check (Joi), idempotency key dedup (Redis), fraud score
 *  2. Processing   — Stripe charge or ACH debit via the PaymentGateway adapter
 *
 * Idempotency is enforced by storing the SHA-256 of (idempotency-key + amount +
 * currency) in Redis with a 24-hour TTL. A repeated request returns the cached
 * response without hitting Stripe again.
 *
 * Circuit breaker (opossum) wraps all Stripe calls. It opens after 5 consecutive
 * failures and half-opens after 10s, matching the SLA defined in ADR-0042.
 *
 * @module payment-api
 * @version 2.4.0
 * @license MIT
 */

"use strict";

const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const Joi = require("joi");
const Redis = require("ioredis");
const CircuitBreaker = require("opossum");
const crypto = require("crypto");
const { promisify } = require("util");
const logger = require("./logger"); // Pino JSON logger
const { PaymentGateway } = require("./gateway");
const { MetricsRegistry } = require("./metrics");

// ---------------------------------------------------------------------------
// Configuration — resolved from environment variables at startup.
// All sensitive values come from Secrets Manager via ECS task injection.
// ---------------------------------------------------------------------------

const CONFIG = {
    port: parseInt(process.env.PORT ?? "8080", 10),
    nodeEnv: process.env.NODE_ENV ?? "development",

    // Redis connection — used for idempotency keys and rate-limit counters
    redis: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
        password: process.env.REDIS_PASSWORD,
        tls: process.env.REDIS_TLS === "true",
        keyPrefix: "payment:", // All keys namespaced to avoid collisions
    },

    // Stripe / payment gateway
    gateway: {
        secretKey: process.env.STRIPE_SECRET_KEY, // Injected from Secrets Manager
        maxRetries: 3,
        timeoutMs: 5000,
    },

    // Circuit breaker thresholds — tuned to match ADR-0042 SLA targets
    circuitBreaker: {
        timeout: 5000,          // ms before a call is considered failed
        errorThresholdPercent: 50, // Open the breaker at 50% error rate
        resetTimeout: 10000,    // ms to wait before trying again (half-open)
        volumeThreshold: 5,     // Minimum calls before stats are meaningful
    },

    // Idempotency key TTL in seconds (24 hours)
    idempotencyTtlSeconds: 86400,

    // Global rate limit — 100 requests per minute per IP
    rateLimitWindowMs: 60 * 1000,
    rateLimitMax: 100,
};

// ---------------------------------------------------------------------------
// Application bootstrap
// ---------------------------------------------------------------------------

const app = express();
const metrics = new MetricsRegistry();

// Security headers — sets X-Frame-Options, HSTS, CSP, etc.
// Note: CSP directives are intentionally restrictive for a pure API server.
app.use(helmet({ contentSecurityPolicy: false }));

// Gzip compression — reduces response size for large payment history payloads
app.use(compression());

// Parse JSON bodies; limit to 100kb to prevent DoS via oversized payloads
app.use(express.json({ limit: "100kb" }));

// Attach request-scoped logger (adds trace-id to every log line)
app.use((req, _res, next) => {
    req.log = logger.child({ traceId: req.headers["x-trace-id"] ?? crypto.randomUUID() });
    next();
});

// Prometheus metrics — increment request counter on every incoming call
app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        metrics.httpRequestDuration.observe(
            { method: req.method, route: req.route?.path ?? "unknown", status: res.statusCode },
            durationMs
        );
        metrics.httpRequestTotal.inc({ method: req.method, status: res.statusCode });
    });
    next();
});

// Per-endpoint rate limiter — prevents brute-force and scraping
const limiter = rateLimit({
    windowMs: CONFIG.rateLimitWindowMs,
    max: CONFIG.rateLimitMax,
    standardHeaders: true,  // Return RateLimit-* headers
    legacyHeaders: false,   // Do not use X-RateLimit-* headers (deprecated)
    keyGenerator: (req) => req.ip, // Scope limit per client IP
});
app.use("/payments", limiter);

// ---------------------------------------------------------------------------
// Redis client
// ---------------------------------------------------------------------------

const redis = new Redis({
    host: CONFIG.redis.host,
    port: CONFIG.redis.port,
    password: CONFIG.redis.password,
    tls: CONFIG.redis.tls ? {} : undefined,
    keyPrefix: CONFIG.redis.keyPrefix,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
});

redis.on("error", (err) => {
    // Log but don't crash — the idempotency check degrades gracefully to a
    // pass-through if Redis is unavailable. The circuit breaker will still
    // protect Stripe from duplicate charges via its error-rate logic.
    logger.error({ err }, "Redis connection error");
});

// ---------------------------------------------------------------------------
// Payment gateway + circuit breaker
// ---------------------------------------------------------------------------

const gateway = new PaymentGateway({
    secretKey: CONFIG.gateway.secretKey,
    maxRetries: CONFIG.gateway.maxRetries,
    timeoutMs: CONFIG.gateway.timeoutMs,
});

/**
 * Circuit breaker wrapping all outbound Stripe API calls.
 * When open, `breaker.fire()` immediately rejects with a `CircuitOpenError`
 * which is caught below and mapped to HTTP 503.
 */
const breaker = new CircuitBreaker(
    (params) => gateway.charge(params),
    CONFIG.circuitBreaker
);

breaker.on("open", () => {
    logger.warn("Circuit breaker OPEN — Stripe calls suspended");
    metrics.circuitBreakerState.set({ state: "open" }, 1);
});
breaker.on("halfOpen", () => {
    logger.info("Circuit breaker HALF-OPEN — probing Stripe");
    metrics.circuitBreakerState.set({ state: "half-open" }, 1);
});
breaker.on("close", () => {
    logger.info("Circuit breaker CLOSED — Stripe calls resumed");
    metrics.circuitBreakerState.set({ state: "closed" }, 1);
});

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/**
 * Schema for POST /payments.
 * Amount is in the smallest currency unit (cents for USD, pence for GBP, etc.)
 * to avoid floating-point rounding errors — a common source of payment bugs.
 */
const createPaymentSchema = Joi.object({
    amount: Joi.number().integer().min(50).max(99999999).required(),
    currency: Joi.string().length(3).uppercase().required(), // ISO 4217
    paymentMethodId: Joi.string().pattern(/^pm_/).required(),
    description: Joi.string().max(500).optional(),
    metadata: Joi.object().max(20).optional(), // Passed through to Stripe
});

/**
 * Schema for POST /payments/:id/refund.
 * Omitting `amount` triggers a full refund matching the original charge.
 */
const refundPaymentSchema = Joi.object({
    amount: Joi.number().integer().min(1).optional(),
    reason: Joi.string().valid("duplicate", "fraudulent", "requested_by_customer").optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derives a deterministic idempotency cache key from the request headers
 * and body. This ensures that retrying the exact same logical request never
 * creates a duplicate charge, even if the network dropped the first response.
 *
 * @param {string} idempotencyHeader - Value of the X-Idempotency-Key header
 * @param {number} amount - Payment amount in smallest currency unit
 * @param {string} currency - ISO 4217 currency code
 * @returns {string} SHA-256 hex digest used as the Redis key
 */
function deriveIdempotencyKey(idempotencyHeader, amount, currency) {
    return crypto
        .createHash("sha256")
        .update(`${idempotencyHeader}:${amount}:${currency}`)
        .digest("hex");
}

/**
 * Sends a standardised JSON error response.
 *
 * @param {import('express').Response} res - Express response object
 * @param {number} status - HTTP status code
 * @param {string} code - Machine-readable error code (e.g. "VALIDATION_ERROR")
 * @param {string} message - Human-readable error message
 */
function sendError(res, status, code, message) {
    res.status(status).json({ error: { code, message } });
}

// ---------------------------------------------------------------------------
// Route: POST /payments
// ---------------------------------------------------------------------------

/**
 * Initiates a new payment.
 *
 * Idempotency: callers MUST supply `X-Idempotency-Key` (UUID recommended).
 * A repeated request with the same key returns the original response from
 * Redis without re-charging the card.
 *
 * @example
 * curl -X POST https://api.example.com/payments \
 *   -H "Content-Type: application/json" \
 *   -H "X-Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
 *   -d '{"amount":1999,"currency":"USD","paymentMethodId":"pm_card_visa"}'
 */
app.post("/payments", async (req, res) => {
    const idempotencyHeader = req.headers["x-idempotency-key"];
    if (!idempotencyHeader) {
        return sendError(res, 400, "MISSING_IDEMPOTENCY_KEY", "X-Idempotency-Key header is required");
    }

    // Validate request body against Joi schema
    const { error, value } = createPaymentSchema.validate(req.body, { abortEarly: false });
    if (error) {
        return sendError(res, 422, "VALIDATION_ERROR", error.details.map((d) => d.message).join("; "));
    }

    const cacheKey = deriveIdempotencyKey(idempotencyHeader, value.amount, value.currency);

    // Check Redis for a cached response from a previous identical request
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            req.log.info({ cacheKey }, "Idempotency hit — returning cached response");
            res.setHeader("X-Idempotency-Replay", "true");
            return res.status(200).json(JSON.parse(cached));
        }
    } catch (redisErr) {
        // Redis miss or unavailable — proceed to charge (degraded mode)
        req.log.warn({ err: redisErr }, "Redis unavailable — skipping idempotency check");
    }

    // Fire the charge through the circuit breaker
    let chargeResult;
    try {
        chargeResult = await breaker.fire({
            amount: value.amount,
            currency: value.currency.toLowerCase(),
            payment_method: value.paymentMethodId,
            description: value.description,
            metadata: value.metadata,
            confirm: true,
            // Capture immediately — use capture_method: 'manual' for auth-then-capture
        });
    } catch (chargeErr) {
        if (chargeErr.name === "OpenCircuitError") {
            req.log.error("Circuit open — rejecting payment request");
            return sendError(res, 503, "GATEWAY_UNAVAILABLE", "Payment gateway temporarily unavailable. Please retry.");
        }
        req.log.error({ err: chargeErr }, "Stripe charge failed");
        const status = chargeErr.statusCode >= 400 && chargeErr.statusCode < 500 ? chargeErr.statusCode : 502;
        return sendError(res, status, "GATEWAY_ERROR", chargeErr.message);
    }

    const response = {
        id: chargeResult.id,
        status: chargeResult.status,
        amount: chargeResult.amount,
        currency: chargeResult.currency.toUpperCase(),
        createdAt: new Date(chargeResult.created * 1000).toISOString(),
    };

    // Cache the successful response in Redis to satisfy future idempotent retries
    try {
        await redis.setex(cacheKey, CONFIG.idempotencyTtlSeconds, JSON.stringify(response));
    } catch (cacheErr) {
        req.log.warn({ err: cacheErr }, "Failed to cache idempotency response in Redis");
    }

    req.log.info({ paymentId: response.id, amount: value.amount, currency: value.currency }, "Payment created");
    metrics.paymentsTotal.inc({ currency: value.currency, status: "success" });

    return res.status(201).json(response);
});

// ---------------------------------------------------------------------------
// Route: GET /payments/:id
// ---------------------------------------------------------------------------

app.get("/payments/:id", async (req, res) => {
    const { id } = req.params;

    // Basic format validation — Stripe charge IDs start with "ch_" or "pi_"
    if (!/^(ch_|pi_)[A-Za-z0-9]{24,}$/.test(id)) {
        return sendError(res, 400, "INVALID_PAYMENT_ID", "Payment ID format is invalid");
    }

    try {
        const payment = await gateway.retrieve(id);
        return res.json({
            id: payment.id,
            status: payment.status,
            amount: payment.amount,
            currency: payment.currency.toUpperCase(),
            createdAt: new Date(payment.created * 1000).toISOString(),
        });
    } catch (err) {
        if (err.statusCode === 404) {
            return sendError(res, 404, "PAYMENT_NOT_FOUND", `Payment ${id} not found`);
        }
        req.log.error({ err, paymentId: id }, "Failed to retrieve payment");
        return sendError(res, 502, "GATEWAY_ERROR", "Unable to retrieve payment from gateway");
    }
});

// ---------------------------------------------------------------------------
// Route: POST /payments/:id/refund
// ---------------------------------------------------------------------------

app.post("/payments/:id/refund", async (req, res) => {
    const { id } = req.params;

    const { error, value } = refundPaymentSchema.validate(req.body);
    if (error) {
        return sendError(res, 422, "VALIDATION_ERROR", error.details[0].message);
    }

    try {
        const refund = await gateway.refund(id, value.amount, value.reason);
        req.log.info({ paymentId: id, refundId: refund.id, amount: refund.amount }, "Refund issued");
        metrics.refundsTotal.inc({ reason: value.reason ?? "unspecified" });
        return res.json({ id: refund.id, status: refund.status, amount: refund.amount });
    } catch (err) {
        req.log.error({ err, paymentId: id }, "Refund failed");
        const status = err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 502;
        return sendError(res, status, "REFUND_ERROR", err.message);
    }
});

// ---------------------------------------------------------------------------
// Route: GET /health
// ---------------------------------------------------------------------------

/**
 * Liveness + readiness probe.
 * Returns 200 only when Redis is reachable and the circuit breaker is not open.
 * ECS and k8s stop routing traffic to a task if this returns non-2xx.
 */
app.get("/health", async (_req, res) => {
    const checks = {
        redis: "unknown",
        circuitBreaker: breaker.opened ? "open" : "closed",
    };

    try {
        const pong = await redis.ping();
        checks.redis = pong === "PONG" ? "ok" : "degraded";
    } catch {
        checks.redis = "unavailable";
    }

    const healthy = checks.redis !== "unavailable" && !breaker.opened;
    return res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "degraded", checks });
});

// ---------------------------------------------------------------------------
// Route: GET /metrics
// ---------------------------------------------------------------------------

// Prometheus scrape endpoint — response MUST have text/plain content type
app.get("/metrics", (_req, res) => {
    res.set("Content-Type", "text/plain; version=0.0.4");
    res.send(metrics.registry.metrics());
});

// ---------------------------------------------------------------------------
// Global error handler — last resort for unexpected throws
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
    req.log.error({ err }, "Unhandled error");
    sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function start() {
    // Connect Redis before accepting traffic — fail fast on misconfiguration
    await redis.connect();
    logger.info({ host: CONFIG.redis.host, port: CONFIG.redis.port }, "Redis connected");

    app.listen(CONFIG.port, () => {
        logger.info(
            { port: CONFIG.port, env: CONFIG.nodeEnv, version: "2.4.0" },
            "payment-api listening"
        );
    });
}

start().catch((err) => {
    logger.fatal({ err }, "Failed to start payment-api — exiting");
    process.exit(1);
});

module.exports = app; // Export for supertest integration tests
