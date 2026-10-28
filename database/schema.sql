-- Student Project Submission and Mentor Review
-- Run this entire script in Supabase Dashboard -> SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  email text not null unique check (email = lower(trim(email)) and char_length(email) <= 254),
  password_hash text not null,
  role text not null default 'student' check (role in ('student', 'mentor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.app_users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 20 and 5000),
  github_url text check (github_url is null or (char_length(github_url) <= 500 and github_url ~ '^https?://')),
  demo_url text check (demo_url is null or (char_length(demo_url) <= 500 and demo_url ~ '^https?://')),
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'revision_requested', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.project_submissions(id) on delete cascade,
  mentor_id uuid not null references public.app_users(id) on delete restrict,
  rating integer not null check (rating between 1 and 5),
  feedback text not null check (char_length(trim(feedback)) between 5 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_submissions_student_created_idx on public.project_submissions(student_id, created_at desc);
create index if not exists project_submissions_status_idx on public.project_submissions(status);
create index if not exists project_reviews_mentor_idx on public.project_reviews(mentor_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at before update on public.app_users for each row execute function public.set_updated_at();
drop trigger if exists project_submissions_set_updated_at on public.project_submissions;
create trigger project_submissions_set_updated_at before update on public.project_submissions for each row execute function public.set_updated_at();
drop trigger if exists project_reviews_set_updated_at on public.project_reviews;
create trigger project_reviews_set_updated_at before update on public.project_reviews for each row execute function public.set_updated_at();

-- The application uses a server-side service-role client. Enable RLS as defense-in-depth:
-- service-role requests bypass RLS, so Express middleware and ownership checks are essential.
-- Never expose SUPABASE_SERVICE_ROLE_KEY to browser code.
alter table public.app_users enable row level security;
alter table public.project_submissions enable row level security;
alter table public.project_reviews enable row level security;

-- Mentor setup: first register the intended mentor account through the app as a student.
-- Then run a narrowly targeted statement in SQL Editor, replacing the email:
-- update public.app_users set role = 'mentor' where email = 'mentor@example.edu';


-- Update a submission's status and insert/update its review in one database transaction.
-- The Express API calls this function only after verifying the current user is a mentor.
create or replace function public.save_project_review(
  p_submission_id uuid,
  p_mentor_id uuid,
  p_status text,
  p_rating integer,
  p_feedback text
) returns void
language plpgsql
as $$
begin
  if p_status not in ('submitted', 'in_review', 'revision_requested', 'approved') then
    raise exception 'Invalid status';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Invalid rating';
  end if;
  if char_length(trim(p_feedback)) < 5 or char_length(trim(p_feedback)) > 3000 then
    raise exception 'Invalid feedback';
  end if;
  update public.project_submissions set status = p_status where id = p_submission_id;
  if not found then raise exception 'Submission not found'; end if;
  insert into public.project_reviews (submission_id, mentor_id, rating, feedback)
  values (p_submission_id, p_mentor_id, p_rating, trim(p_feedback))
  on conflict (submission_id) do update
    set mentor_id = excluded.mentor_id,
        rating = excluded.rating,
        feedback = excluded.feedback,
        updated_at = now();
end;
$$;
revoke all on function public.save_project_review(uuid, uuid, text, integer, text) from public;
grant execute on function public.save_project_review(uuid, uuid, text, integer, text) to service_role;
