# Supabase migrations

Apply migrations to the Supabase project before deploying the matching app code.

The household RLS migration creates one initial household, adds all existing
Supabase Auth users as members, and assigns existing app data to that shared
household. New Auth users must be added to `household_members` before they can
access household data.

Apply with a linked Supabase CLI project:

```bash
supabase db push
```

Alternatively, run the migration SQL in the Supabase SQL Editor.
