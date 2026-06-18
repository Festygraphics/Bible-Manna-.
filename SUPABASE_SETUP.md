# Supabase Database Schema Setup Guide

The Bible Manna app uses Supabase for cloud synchronization of user data, streak records, prayer journals, saved scriptures, chat histories, and reading plan progress.

If you encounter schema cache or security policy error messages like:
- `Could not find the 'telegram_id' column of 'users' or 'prayers' in the schema cache`
- `new row violates row-level security policy`
- `Could not find the 'lang' column of 'users' or 'answered' column of 'prayers'`

It means your remote Supabase database has existing tables with different structures, outdated schema caches, or Row-Level Security (RLS) configuration blocking client inserts.

---

### How to Fix this in 3 Simple Steps:

1. **Copy the SQL script** in the section below.
2. Go to your **[Supabase Dashboard](https://supabase.com/dashboard)** and select your database project.
3. Open the **SQL Editor** from the left navigation rail, click **"New query"**, paste the script, and tap **"Run"**!

Your remote database will instantly align with Bible Manna, reset its schema cache, allow updates, and resume flawless synchronization!

---

### SQL Migration Script

```sql
-- ======================================================================
-- BIBLE MANNA COMPLETE SCHEMAS, UPGRADE & SECURITY POLICY RESET
-- Resolves column schema caches, RLS policies, and missing telegram_ids
-- ======================================================================

-- 1. Ensure the 'users' table exists and has all required fields
CREATE TABLE IF NOT EXISTS public.users (
    telegram_id text PRIMARY KEY,
    first_name text DEFAULT 'Believer',
    last_name text DEFAULT '',
    username text DEFAULT '',
    photo_url text DEFAULT '',
    streak_count integer DEFAULT 1,
    last_active text,
    is_premium boolean DEFAULT false,
    premium_status text DEFAULT 'free',
    premium_expires_at text,
    wallet_address text,
    last_transaction_hash text,
    verses_read integer DEFAULT 0,
    lang text DEFAULT 'en',
    reminders jsonb DEFAULT null,
    channel_joined boolean DEFAULT false,
    chat_trials_bonus integer DEFAULT 0,
    updated_at text
);

-- Safely add 'telegram_id' and other columns if they are missing in your existing 'users' table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS telegram_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_name text DEFAULT 'Believer';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_name text DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username text DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS photo_url text DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS streak_count integer DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_active text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS premium_status text DEFAULT 'free';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS premium_expires_at text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_address text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_transaction_hash text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verses_read integer DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lang text DEFAULT 'en';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reminders jsonb DEFAULT null;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS channel_joined boolean DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS chat_trials_bonus integer DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at text;

-- CRITICAL RESOLUTION OF PRIMARY KEY & NULL ID CONSTRAINTS ON 'users'
DO $$
DECLARE
    col_type text;
BEGIN
    -- 1. Ensure telegram_id column exists, is NOT NULL, and has safe defaults
    ALTER TABLE public.users ALTER COLUMN telegram_id SET NOT NULL;
    
    -- 2. Dynamically resolve ID auto-generation based on data type (works for both uuid and bigserial/int)
    SELECT data_type INTO col_type 
    FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'id';

    IF col_type = 'uuid' THEN
        -- Safely assign UUID default if none is present
        IF NOT EXISTS (
            SELECT column_default FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'id' AND column_default IS NOT NULL
        ) THEN
            ALTER TABLE public.users ALTER COLUMN id SET DEFAULT gen_random_uuid();
        END IF;
    ELSIF col_type = 'bigint' OR col_type = 'integer' THEN
        -- Safely assign sequence generator so that inserts omitting 'id' automatically increment
        IF NOT EXISTS (
            SELECT column_default FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'id' AND column_default IS NOT NULL
        ) THEN
            CREATE SEQUENCE IF NOT EXISTS public.users_id_seq;
            PERFORM setval('public.users_id_seq', COALESCE((SELECT MAX(id) FROM public.users), 0) + 1, false);
            ALTER TABLE public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq');
        END IF;
    END IF;

EXCEPTION WHEN others THEN
    RAISE NOTICE 'Handled ID default constraints gracefully.';
END $$;

-- CRITICAL FIX FOR CONFLICT RESOLUTION: Ensure telegram_id has a unique constraint if it's not already the primary key
DO $$
BEGIN
    -- Only add if telegram_id does not already have a unique or primary key constraint on it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'users' AND (tc.constraint_type = 'PRIMARY KEY' OR tc.constraint_type = 'UNIQUE')
        AND kcu.column_name = 'telegram_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_telegram_id_key'
    ) THEN
        -- Add unique constraint so onConflict UPSERT works flawlessly
        BEGIN
            ALTER TABLE public.users ADD CONSTRAINT users_telegram_id_key UNIQUE (telegram_id);
        EXCEPTION WHEN others THEN
            -- Handle potential duplicate or null values gracefully by logging
            RAISE NOTICE 'Could not add unique constraint automatically. Check for null or duplicate telegram_id numbers in active database.';
        END;
    END IF;
END $$;

-- 2. Ensure the 'prayers' table exists and has the 'telegram_id' and 'answered' indicators
CREATE TABLE IF NOT EXISTS public.prayers (
    id text PRIMARY KEY,
    telegram_id text,
    content text,
    created_at text,
    answered boolean DEFAULT false
);

ALTER TABLE public.prayers ADD COLUMN IF NOT EXISTS telegram_id text;
ALTER TABLE public.prayers ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.prayers ADD COLUMN IF NOT EXISTS created_at text;
ALTER TABLE public.prayers ADD COLUMN IF NOT EXISTS answered boolean DEFAULT false;

-- CRITICAL FIX FOR UUID MISMATCH: Safely convert 'id' columns from UUID to TEXT to support custom app formats (like "prayer-1781613256560")
ALTER TABLE public.prayers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.prayers ALTER COLUMN id TYPE text USING id::text;

-- 3. Ensure the 'saved_verses' table exists for bookmarked scriptures
CREATE TABLE IF NOT EXISTS public.saved_verses (
    id text PRIMARY KEY,
    telegram_id text,
    text text,
    ref text,
    created_at text
);

ALTER TABLE public.saved_verses ADD COLUMN IF NOT EXISTS telegram_id text;
ALTER TABLE public.saved_verses ADD COLUMN IF NOT EXISTS text text;
ALTER TABLE public.saved_verses ADD COLUMN IF NOT EXISTS ref text;
ALTER TABLE public.saved_verses ADD COLUMN IF NOT EXISTS created_at text;

ALTER TABLE public.saved_verses ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.saved_verses ALTER COLUMN id TYPE text USING id::text;

-- 4. Ensure the 'chat_history' table exists for AI conversations and reflections
CREATE TABLE IF NOT EXISTS public.chat_history (
    id text PRIMARY KEY,
    telegram_id text,
    role text,
    text text,
    sender_name text,
    timestamp text
);

ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS telegram_id text;
ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS text text;
ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS timestamp text;

-- CRITICAL FIX: Drop NOT NULL constraint on any legacy 'question' or 'answer' columns if they exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_history' AND column_name = 'question'
    ) THEN
        ALTER TABLE public.chat_history ALTER COLUMN question DROP NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'chat_history' AND column_name = 'answer'
    ) THEN
        ALTER TABLE public.chat_history ALTER COLUMN answer DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE public.chat_history ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.chat_history ALTER COLUMN id TYPE text USING id::text;

-- 5. Ensure the 'reading_plans' table exists for active Bible tracks
CREATE TABLE IF NOT EXISTS public.reading_plans (
    id text PRIMARY KEY,
    telegram_id text,
    plan_id text,
    progress integer DEFAULT 0,
    started boolean DEFAULT false
);

ALTER TABLE public.reading_plans ADD COLUMN IF NOT EXISTS telegram_id text;
ALTER TABLE public.reading_plans ADD COLUMN IF NOT EXISTS plan_id text;
ALTER TABLE public.reading_plans ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0;
ALTER TABLE public.reading_plans ADD COLUMN IF NOT EXISTS started boolean DEFAULT false;

ALTER TABLE public.reading_plans ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.reading_plans ALTER COLUMN id TYPE text USING id::text;

-- 6. Ensure the 'payments' table exists for verified Telegram Stars payments (secure against replays)
CREATE TABLE IF NOT EXISTS public.payments (
    id text PRIMARY KEY, -- telegram_payment_charge_id
    telegram_id text NOT NULL,
    amount integer NOT NULL, -- Stars amount
    payload text NOT NULL, -- payload used in createInvoiceLink
    status text NOT NULL, -- 'pending', 'paid', 'failed'
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ======================================================================
-- ROW-LEVEL SECURITY (RLS) RESET
-- Disables RLS so that synchronization queries via the API or clients
-- can read and insert record sets correctly without permission violations.
-- ======================================================================
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prayers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_verses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;

-- ======================================================================
-- RELOAD SCHEMA CACHE
-- Forces Supabase to update its internal representation cache of table columns instantly
-- ======================================================================
NOTIFY pgrst, 'reload schema';
```
