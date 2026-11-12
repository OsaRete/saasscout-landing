-- Additive private external_mvp method; existing family semantics and shared boundaries unchanged.
alter table public.validation_experiment_versions drop constraint validation_experiment_versions_family_check;
alter table public.validation_experiment_versions add constraint validation_experiment_versions_family_check check (family in ('customer_interview','survey','landing_waitlist','social_validation_post','interactive_prototype','external_mvp'));
-- Private, service-only external_mvp pages. No shared evidence or public database grants.
create table public.validation_external_mvp_pages (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 experiment_version_id uuid not null, revision integer not null default 1 check(revision>0),
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=24000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(experiment_version_id), unique(id,owner_id),
 foreign key(experiment_version_id,owner_id) references public.validation_experiment_versions(id,owner_id) on delete restrict
);
create table public.validation_external_mvp_publications (
 id uuid primary key default gen_random_uuid(), page_id uuid not null, owner_id uuid not null,
 revision integer not null, content jsonb not null, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 published_at timestamptz not null default now(), revoked_at timestamptz,
 unique(id,page_id,owner_id),
 foreign key(page_id,owner_id) references public.validation_external_mvp_pages(id,owner_id) on delete restrict
);
create unique index validation_external_mvp_active on public.validation_external_mvp_publications(page_id) where revoked_at is null;
create table public.validation_external_mvp_submissions (
 id uuid primary key default gen_random_uuid(), publication_id uuid not null, page_id uuid not null, owner_id uuid not null,
 request_id uuid not null, payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=44000),

 email text check(email is null or length(email)<=254), contact_consent_text text, contact_removed boolean not null default false, consent_text text not null,
 submitted_at timestamptz not null default now(), unique(publication_id,request_id),
 foreign key(publication_id,page_id,owner_id) references public.validation_external_mvp_publications(id,page_id,owner_id) on delete restrict
);
create index validation_external_mvp_submissions_page on public.validation_external_mvp_submissions(page_id,submitted_at desc);
create table public.validation_external_mvp_rate_buckets (
 publication_id uuid not null references public.validation_external_mvp_publications(id),
 network_hash text not null, minute timestamptz not null, attempts integer not null,
 primary key(publication_id,network_hash,minute)
);

-- No browser grants, even owner reads: the authenticated dashboard uses scoped server commands.
do $$ declare t text; begin
 foreach t in array array['validation_external_mvp_pages','validation_external_mvp_publications','validation_external_mvp_submissions','validation_external_mvp_rate_buckets'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;

create function public.validation_external_mvp_validate_content(c jsonb) returns void language plpgsql set search_path=public,pg_temp as $$
declare u text; host text;
begin
 if c is null or jsonb_typeof(c)<>'object' or octet_length(c::text)>24000
 or jsonb_typeof(c->'title') is distinct from 'string' or length(trim(c->>'title')) not between 1 and 180
 or jsonb_typeof(c->'purpose') is distinct from 'string' or length(trim(c->>'purpose')) not between 1 and 1000
 or jsonb_typeof(c->'instructions') is distinct from 'string' or length(trim(c->>'instructions')) not between 1 and 2000
 or c->>'consent' is distinct from 'I agree to share my feedback privately with the experiment creator for product research. I will not include personal or sensitive information in my answers.'
 or jsonb_typeof(c->'questions') is distinct from 'array' then raise exception 'invalid test'; end if;
 if jsonb_array_length(c->'questions') not between 1 and 5 then raise exception 'question limit'; end if;
 if exists(select 1 from jsonb_array_elements(c->'questions') q where jsonb_typeof(q)<>'string' or length(trim(q#>>'{}')) not between 1 and 240)
 or (select count(distinct lower(trim(q#>>'{}'))) from jsonb_array_elements(c->'questions') q)<>jsonb_array_length(c->'questions') then raise exception 'invalid questions'; end if;
 u:=c->>'url';
 if jsonb_typeof(c->'url') is distinct from 'string' or length(u) not between 1 and 2000 or u !~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(/[^[:space:]#]*)?$' or u ~ '[[:cntrl:]\\]' then raise exception 'unsafe external URL'; end if;
 host:=split_part(substring(u from 9),'/',1);
 if host ~ '(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$' or host ~ '(^|\.)(localhost|metadata)\.' then raise exception 'private hostname'; end if;
end $$;
revoke all on function public.validation_external_mvp_validate_content(jsonb) from public,anon,authenticated;
grant execute on function public.validation_external_mvp_validate_content(jsonb) to service_role;

create function public.validation_external_mvp_owner(p_owner_id uuid,p_version_id uuid,p_action text,p_content jsonb default null,p_revision integer default null,p_token_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v public.validation_experiment_versions; p public.validation_external_mvp_pages; result jsonb; pub uuid;
begin
 -- Same lock order for owner and public commands: version, page, publication.
 select * into v from public.validation_experiment_versions where id=p_version_id and owner_id=p_owner_id and family='external_mvp' for share;
 if not found then raise no_data_found; end if;
 if p_action is null or p_action not in ('read','save','publish','unpublish','remove') then raise exception 'invalid action'; end if;
 -- Serialize first creation and revisions without changing the immutable experiment.
 perform pg_advisory_xact_lock(hashtextextended(p_version_id::text,719));
 select * into p from public.validation_external_mvp_pages where experiment_version_id=v.id and owner_id=p_owner_id for update;
 if p_action='save' then
  if v.lifecycle not in ('draft','ready','running','paused') then raise exception 'terminal experiment'; end if;
  perform public.validation_external_mvp_validate_content(p_content);
  if p.id is null then
   if p_revision is distinct from 0 then raise exception 'revision conflict'; end if;
   insert into public.validation_external_mvp_pages(owner_id,experiment_version_id,content) values(p_owner_id,v.id,p_content) returning * into p;
  else
   if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
   update public.validation_external_mvp_pages set content=p_content,revision=revision+1,updated_at=now() where id=p.id returning * into p;
  end if;
 elsif p_action='remove' then
  if p.id is null then raise no_data_found; end if;
  update public.validation_external_mvp_submissions set email=null,contact_removed=true
   where id=(p_content->>'submissionId')::uuid and page_id=p.id and owner_id=p_owner_id;
  if not found then raise no_data_found; end if;
 elsif p_action in ('publish','unpublish') then
  if p.id is null then raise no_data_found; end if;
  if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
  if p_action='publish' and (v.lifecycle<>'running' or p_token_hash is null) then raise exception 'not running'; end if;
  update public.validation_external_mvp_publications set revoked_at=clock_timestamp() where page_id=p.id and revoked_at is null;
  if p_action='publish' then
   insert into public.validation_external_mvp_publications(page_id,owner_id,revision,content,token_hash) values(p.id,p_owner_id,p.revision,p.content,p_token_hash) returning id into pub;
  end if;
 end if;
 select jsonb_build_object('page',case when p.id is null then null else jsonb_build_object('id',p.id,'revision',p.revision,'content',p.content) end,
 'publication',(select jsonb_build_object('id',id,'revision',revision,'publishedAt',published_at) from public.validation_external_mvp_publications where page_id=p.id and revoked_at is null),
 'metrics',jsonb_build_object(
 'submissions',(select count(*) from public.validation_external_mvp_submissions where page_id=p.id),
 'contacts',(select count(*) from public.validation_external_mvp_submissions where page_id=p.id and email is not null),
 'outcomes',coalesce((select jsonb_agg(x) from (select payload->>'outcome' as outcome,count(*) from public.validation_external_mvp_submissions where page_id=p.id group by payload->>'outcome') x),'[]'::jsonb)),
 'submissions',coalesce((select jsonb_agg(x) from (select s.id,u.revision,s.payload->>'outcome' as outcome,
 (select jsonb_agg(jsonb_build_object('question',q.value,'answer',s.payload->'answers'->(q.ordinality::integer-1))) from jsonb_array_elements(u.content->'questions') with ordinality q) as answers,
 s.email,s.submitted_at from public.validation_external_mvp_submissions s join public.validation_external_mvp_publications u on u.id=s.publication_id where s.page_id=p.id order by s.submitted_at desc limit 100) x),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.validation_external_mvp_public(p_token_hash text,p_action text,p_request_id uuid default null,p_payload jsonb default null,p_consent boolean default false,p_network_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare pub public.validation_external_mvp_publications; p public.validation_external_mvp_pages; v public.validation_experiment_versions; n integer; prior public.validation_external_mvp_submissions; feedback jsonb; email_value text;
begin
 select * into pub from public.validation_external_mvp_publications where token_hash=p_token_hash;
 if not found then raise no_data_found; end if;
 select * into p from public.validation_external_mvp_pages where id=pub.page_id;
 select * into v from public.validation_experiment_versions where id=p.experiment_version_id and owner_id=p.owner_id and family='external_mvp' and lifecycle='running' for share;
 if not found then raise no_data_found; end if;
 perform 1 from public.validation_external_mvp_pages where id=p.id for share;
 -- Serialize public admissions for exact capacity/idempotency and lifecycle races.
 select * into pub from public.validation_external_mvp_publications where id=pub.id and revoked_at is null for update;
 if not found then raise no_data_found; end if;
 if p_action is null or p_action not in ('resolve','submit') or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid request'; end if;
 -- Global per-publication budget also bounds distributed/rotating-IP abuse.
 insert into public.validation_external_mvp_rate_buckets values(pub.id,'global',date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=validation_external_mvp_rate_buckets.attempts+1 returning attempts into n;
 if n>600 then return jsonb_build_object('limited',true); end if;
 insert into public.validation_external_mvp_rate_buckets values(pub.id,p_network_hash,date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=validation_external_mvp_rate_buckets.attempts+1 returning attempts into n;
 if n>60 then return jsonb_build_object('limited',true); end if;
 delete from public.validation_external_mvp_rate_buckets where publication_id=pub.id and minute<now()-interval '1 day';
 if p_action='resolve' then
  return jsonb_build_object('title',pub.content->'title','purpose',pub.content->'purpose','url',pub.content->'url','instructions',pub.content->'instructions','questions',pub.content->'questions','consent',pub.content->'consent');
 end if;
 if p_consent is distinct from true or p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>44000
 or p_payload->>'consent' is distinct from 'I agree to share my feedback privately with the experiment creator for product research. I will not include personal or sensitive information in my answers.'
 or p_payload->>'outcome' is null or p_payload->>'outcome' not in ('yes','partly','no','not_tried')
 or jsonb_typeof(p_payload->'answers') is distinct from 'array' then raise exception 'invalid feedback'; end if;
 if jsonb_array_length(p_payload->'answers')<>jsonb_array_length(pub.content->'questions') or exists(select 1 from jsonb_array_elements(p_payload->'answers') a where jsonb_typeof(a)<>'string' or length(trim(a#>>'{}')) not between 1 and 2000) then raise exception 'answer limits'; end if;
 email_value:=p_payload->>'email';
 if email_value is not null and (length(email_value) not between 3 and 254 or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_payload->>'contactConsent' is distinct from 'I agree to share my email with the creator for follow-up about this test. I can ask the creator to remove it through the channel that supplied this link.') then raise exception 'contact consent'; end if;
 feedback:=jsonb_build_object('outcome',p_payload->'outcome','answers',p_payload->'answers');
 select * into prior from public.validation_external_mvp_submissions where publication_id=pub.id and request_id=p_request_id;
 if found then
  if prior.payload is distinct from feedback or (not prior.contact_removed and prior.email is distinct from email_value) then raise unique_violation using message='feedback conflict'; end if;
  return jsonb_build_object('accepted',true);
 end if;
 if (select count(*) from public.validation_external_mvp_submissions where page_id=p.id)>=1000 then return jsonb_build_object('capacity',true); end if;
 insert into public.validation_external_mvp_submissions(publication_id,page_id,owner_id,request_id,payload,email,consent_text,contact_consent_text)
 values(pub.id,p.id,p.owner_id,p_request_id,feedback,email_value,pub.content->>'consent',case when email_value is null then null else 'I agree to share my email with the creator for follow-up about this test. I can ask the creator to remove it through the channel that supplied this link.' end);
 return jsonb_build_object('accepted',true);
end $$;
revoke all on function public.validation_external_mvp_owner(uuid,uuid,text,jsonb,integer,text) from public,anon,authenticated;
revoke all on function public.validation_external_mvp_public(text,text,uuid,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.validation_external_mvp_owner(uuid,uuid,text,jsonb,integer,text) to service_role;
grant execute on function public.validation_external_mvp_public(text,text,uuid,jsonb,boolean,text) to service_role;

-- Preserve exact published content and attribution even for accidental service writes.
create function public.validation_external_mvp_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_table_name='validation_external_mvp_pages' then
  if new.id<>old.id or new.owner_id<>old.owner_id or new.experiment_version_id<>old.experiment_version_id or new.created_at<>old.created_at or new.revision<>old.revision+1 then raise exception 'immutable page identity'; end if;
 elsif tg_table_name='validation_external_mvp_publications' then
  if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') or old.revoked_at is not null or new.revoked_at is null then raise exception 'immutable publication'; end if;
 elsif tg_table_name='validation_external_mvp_submissions' then
  if (to_jsonb(new)-array['email','contact_removed']) is distinct from (to_jsonb(old)-array['email','contact_removed']) or new.email is not null or new.contact_removed is distinct from true then raise exception 'contact removal only'; end if;
 else raise exception 'immutable feedback';
 end if;
 return new;
end $$;
create trigger validation_external_mvp_page_guard before update on public.validation_external_mvp_pages for each row execute function public.validation_external_mvp_guard();
create trigger validation_external_mvp_publication_guard before update on public.validation_external_mvp_publications for each row execute function public.validation_external_mvp_guard();
create trigger validation_external_mvp_submission_guard before update on public.validation_external_mvp_submissions for each row execute function public.validation_external_mvp_guard();
revoke all on function public.validation_external_mvp_guard() from public,anon,authenticated,service_role;
revoke delete on public.validation_external_mvp_pages,public.validation_external_mvp_publications,public.validation_external_mvp_submissions from service_role;
revoke update on public.validation_external_mvp_submissions from service_role;
grant update(email,contact_removed) on public.validation_external_mvp_submissions to service_role;
