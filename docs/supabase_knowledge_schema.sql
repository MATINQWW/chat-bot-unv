-- Run in Supabase SQL Editor before setting KNOWLEDGE_BACKEND=supabase.
create extension if not exists pgcrypto;

create table if not exists public.knowledge_records (
  id text primary key,
  category text not null,
  category_id text,
  title text not null default '',
  content text not null,
  source_type text,
  source_file text,
  source_reference text,
  authority_status text not null default 'unverified' check (authority_status in ('unverified','verified','rejected')),
  temporal_status text not null default 'needs_review' check (temporal_status in ('needs_review','valid','expired','not_applicable')),
  published_at timestamptz,
  valid_until timestamptz,
  language text not null default 'fa',
  use_for_official_claims boolean not null default false,
  notes text,
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,'') || ' ' || coalesce(category,''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint official_claims_require_verified check (not use_for_official_claims or (authority_status = 'verified' and temporal_status in ('valid','not_applicable')))
);
create index if not exists knowledge_records_search_idx on public.knowledge_records using gin(search_vector);
create index if not exists knowledge_records_category_idx on public.knowledge_records(category);
create index if not exists knowledge_records_status_idx on public.knowledge_records(authority_status, temporal_status, use_for_official_claims);

create or replace function public.search_knowledge_records(query_text text, result_limit integer default 6)
returns table (
  id text, category text, category_id text, title text, content text,
  source_type text, source_file text, source_reference text,
  authority_status text, temporal_status text, published_at timestamptz,
  valid_until timestamptz, language text, use_for_official_claims boolean,
  notes text, score real
)
language sql stable security definer set search_path = public
as $$
  with q as (select websearch_to_tsquery('simple', coalesce(query_text,'')) as tsq)
  select k.id, k.category, k.category_id, k.title, k.content,
         k.source_type, k.source_file, k.source_reference,
         k.authority_status, k.temporal_status, k.published_at,
         k.valid_until, k.language, k.use_for_official_claims,
         k.notes, ts_rank_cd(k.search_vector, q.tsq) as score
  from public.knowledge_records k cross join q
  where numnode(q.tsq) > 0 and k.search_vector @@ q.tsq
    and k.authority_status <> 'rejected'
    and (k.valid_until is null or k.valid_until >= now())
  order by ts_rank_cd(k.search_vector, q.tsq) desc,
           (case when k.use_for_official_claims then 0.2 else 0 end) desc, k.id
  limit greatest(1, least(coalesce(result_limit,6),20));
$$;

-- Keep table access server-side. Do not expose the service-role key to browser code.
revoke all on public.knowledge_records from anon, authenticated;
revoke all on function public.search_knowledge_records(text, integer) from anon, authenticated;
grant execute on function public.search_knowledge_records(text, integer) to service_role;
