# Telegram Duty Bot (Vercel + Supabase)

This project is a minimal Telegram chatbot hosted on **Vercel** using **webhooks**, with **Supabase** as the database.

## What changed (per requirements)
- ✅ No message logging (no `message_logs` table; no message history stored)
- ✅ Users table includes: role (admin/commander/trooper), full name, company, platoon
- ✅ `/start`:
  - If user exists in DB: "Welcome back"
  - If user not registered: prompts to register as **trooper only**
- ✅ `/register` registers **trooper only** (commanders/admins should be pre-added in Supabase)

## Supabase setup
1. Create a Supabase project
2. Run the SQL in `supabase/schema.sql` in the Supabase SQL Editor
3. Pre-add commanders/admins directly into `public.users` (role = commander/admin)

## Environment variables (Vercel)
Set these in Vercel Project Settings → Environment Variables:
- `BOT_TOKEN` (Telegram bot token)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- (optional) `WEBHOOK_SECRET`

## Deploy
Deploy to Vercel. Your webhook endpoint:
`/api/webhook`

Set Telegram webhook to:
`https://<your-domain>.vercel.app/api/webhook`
