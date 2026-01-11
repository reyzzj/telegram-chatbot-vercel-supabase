# Telegram Chatbot (Vercel + Supabase) — 24/7 via Webhooks

This bot runs 24/7 on Vercel by using Telegram webhooks (serverless). It logs users + messages into Supabase.

## 1) Create the Supabase tables
Run the SQL in `supabase/schema.sql` in Supabase SQL Editor.

## 2) Set environment variables (Vercel Project → Settings → Environment Variables)
- BOT_TOKEN = Telegram bot token from BotFather
- SUPABASE_URL = your Supabase project URL (https://xxxxx.supabase.co)
- SUPABASE_SERVICE_ROLE_KEY = Supabase service_role key (keep secret!)

Optional (recommended):
- WEBHOOK_SECRET = any random string. If set, Telegram must include it as a secret token header.

## 3) Deploy to Vercel
Import this folder into Vercel and deploy.

## 4) Set Telegram webhook URL
After deploy, set your webhook to:
https://<your-vercel-domain>/api/webhook

If you use WEBHOOK_SECRET, call setWebhook with secret_token.

## Notes
- Visiting `/` may show a simple page; the bot endpoint is `/api/webhook`.
