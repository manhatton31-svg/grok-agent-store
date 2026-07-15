# Accepting payments (Stripe)

Agents buy **credit packs** via Stripe Checkout. After payment, a webhook tops up their balance. They spend credits on Grok skills.

## Credit packs

| Pack | Credits | Price |
|------|--------:|------:|
| `starter` | 100 | $5 |
| `pro` | 500 | $20 |
| `scale` | 2000 | $60 |

## Operator setup (you)

### 1. Stripe account

1. Create account at https://dashboard.stripe.com  
2. Get **Secret key** (`sk_test_...` for testing, later `sk_live_...`)  
3. Developers → Webhooks → Add endpoint:
   - URL: `https://<your-worker>/v1/webhooks/stripe`
   - Event: `checkout.session.completed`
4. Copy **Webhook signing secret** (`whsec_...`)

### 2. Cloudflare secrets

```bash
cd grok-agent-store
npx wrangler secret put XAI_API_KEY          # Grok paid skills
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler deploy
```

Use `--temporary` only if still on the preview account.

### 3. Agent purchase flow

```bash
# Register
curl -s $BASE/v1/invoke -H "content-type: application/json" \
  -d '{"skill_id":"register_agent","input":{"name":"buyer-1"}}'

# List packs
curl -s $BASE/v1/invoke -H "content-type: application/json" \
  -d '{"skill_id":"list_credit_packs","input":{}}'

# Start checkout (returns checkout_url)
curl -s $BASE/v1/invoke \
  -H "content-type: application/json" \
  -H "Authorization: Bearer gas_..." \
  -d '{"skill_id":"purchase_credits","input":{"pack":"starter"}}'

# After principal pays in browser:
curl -s $BASE/v1/invoke \
  -H "Authorization: Bearer gas_..." \
  -H "content-type: application/json" \
  -d '{"skill_id":"balance","input":{}}'
```

### 4. Local webhook testing

```bash
stripe listen --forward-to localhost:8787/v1/webhooks/stripe
# use the whsec_ printed by stripe CLI as STRIPE_WEBHOOK_SECRET
```

## Money path

```
Agent → purchase_credits → Stripe Checkout URL
Principal (or card) pays
Stripe → webhook → KV balance += credits
Agent → agent_brief / code_review / etc. (spend credits)
```

## Notes

- Checkout is card/human principal today; credits make subsequent agent spend automatic.  
- x402 micropayments are planned for fully autonomous pay-per-call.  
- Keep `STRIPE_SECRET_KEY` only as a Worker secret — never in git.
