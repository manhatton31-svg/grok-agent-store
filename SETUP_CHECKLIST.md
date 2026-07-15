# Step-by-step: Glama PR + real payments

**Live base (current preview):**  
https://grok-agent-store.manhatton31.workers.dev

**Claim Cloudflare (do this first so the host does not expire):**  
https://dash.cloudflare.com/claim-preview?claimToken=OsiuV1bU4tOWiIQ4pXylo5LyG18G6SblENlImPYsBfc

After claim, optional permanent deploy:

```bash
cd grok-agent-store
npx wrangler login
npx wrangler kv namespace create STORE
# paste new id into wrangler.jsonc
# set PUBLIC_BASE_URL to your permanent workers.dev URL
npx wrangler deploy
```

---

## Part A â€” Unblock awesome-mcp-servers PR (Glama)

### Already done for you

- Dockerfile + stdio MCP (starts, answers `list_tools` with no secrets)
- Badge line added to PR #10179  
- PR comments with remote URL + Dockerfile note  
- Repo public: https://github.com/manhatton31-svg/grok-agent-store

### Your 3 minutes in the browser

1. Open https://glama.ai/mcp/servers â†’ sign in with GitHub  
2. **Add Server** â†’ repo `https://github.com/manhatton31-svg/grok-agent-store`  
3. Dockerfile path: `Dockerfile`  
4. Wait until checks pass (server starts + introspection)  
5. Confirm listing: https://glama.ai/mcp/servers/manhatton31-svg/grok-agent-store  
6. Optional: https://glama.ai/mcp/connectors â†’ add remote  
   `https://grok-agent-store.manhatton31.workers.dev/mcp` (streamable-http)  
7. Reply on the PR: â€œGlama checks greenâ€  

Badge format already in PR:

```text
https://glama.ai/mcp/servers/manhatton31-svg/grok-agent-store/badges/score.svg
```

---

## Part B â€” Accept payments (Stripe)

### Money model

1. Agent calls `register_agent` â†’ free bonus credits  
2. Agent calls `purchase_credits` â†’ Stripe Checkout URL  
3. Principal pays with card  
4. Stripe webhook tops up agent balance  
5. Agent spends credits on Grok skills  

Packs: `starter` $5/100 Â· `pro` $20/500 Â· `scale` $60/2000

### Secrets to set

```bash
cd grok-agent-store

# 1) Grok (paid skills)
npx wrangler secret put XAI_API_KEY --temporary
# paste from https://console.x.ai

# 2) Stripe
npx wrangler secret put STRIPE_SECRET_KEY --temporary
# sk_test_... first

npx wrangler secret put STRIPE_WEBHOOK_SECRET --temporary
# whsec_... from Stripe webhook endpoint

npx wrangler deploy --temporary
```

### Stripe Dashboard

1. https://dashboard.stripe.com/test/apikeys â†’ Secret key  
2. Developers â†’ Webhooks â†’ Add endpoint  
   - URL: `https://grok-agent-store.manhatton31.workers.dev/v1/webhooks/stripe`  
   - Event: `checkout.session.completed`  
3. Copy signing secret â†’ `STRIPE_WEBHOOK_SECRET`

### Smoke test

```bash
BASE=https://grok-agent-store.manhatton31.workers.dev

curl -s $BASE/v1/invoke -H "content-type: application/json" \
  -d '{"skill_id":"register_agent","input":{"name":"payer-1"}}'
# save api_key

curl -s $BASE/v1/invoke -H "content-type: application/json" \
  -d '{"skill_id":"list_credit_packs","input":{}}'

curl -s $BASE/v1/invoke \
  -H "content-type: application/json" \
  -H "Authorization: Bearer gas_YOUR_KEY" \
  -d '{"skill_id":"purchase_credits","input":{"pack":"starter"}}'
# open checkout_url, pay with Stripe test card 4242...

curl -s $BASE/v1/invoke \
  -H "Authorization: Bearer gas_YOUR_KEY" \
  -H "content-type: application/json" \
  -d '{"skill_id":"balance","input":{}}'
```

Test card: `4242 4242 4242 4242`, any future expiry, any CVC.

---

## Part C â€” Agent revenue loop

| Who | Action |
|-----|--------|
| Buyer agent | `register_agent` â†’ `purchase_credits` â†’ use skills |
| You | Receive Stripe payouts; cover Grok token cost from margin |
| Platform | Charges credits per skill (see `/skills.json`) |

Suggested margins (already coded): skills cost 5â€“25 credits; packs sell ~$0.03â€“0.05/credit.

---

## Order of operations (recommended)

1. **Claim Cloudflare** (so URL stays alive)  
2. **Glama Add Server** (so PR can merge)  
3. **Stripe test keys + webhook**  
4. **XAI_API_KEY**  
5. Full smoke test (register â†’ pay â†’ Grok skill)  
6. Switch Stripe to live keys when ready  

Docs in repo: `GLAMA.md`, `PAYMENTS.md`, this file.
