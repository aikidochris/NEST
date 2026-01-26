-- Create table for tracking shares if it doesn't exist
create table if not exists public.property_shares (
    id uuid default gen_random_uuid() primary key,
    property_id text not null, -- references properties(property_id) - assumes properties table exists and uses text id
    user_id uuid references auth.users(id),
    platform text default 'native',
    created_at timestamptz default now()
);

-- Enable RLS
alter table public.property_shares enable row level security;

-- Policy: Anyone can insert (anonymous or authenticated)
create policy "Anyone can track shares"
    on public.property_shares for insert
    with check (true);

-- Policy: No public read access to raw logs (privacy)
create policy "No public read access"
    on public.property_shares for select
    using (false);

-- RPC to track share (simplifies client call)
create or replace function public.track_property_share(
    pid text,
    p_platform text default 'native'
)
returns void
language plpgsql
security definer -- runs with privileges of creator (admin) to bypass RLS if needed, though insert policy allows it. 
                 -- good for ensuring user_id is captured reliably if we wanted to enforce it, 
                 -- but mainly just a clean interface.
as $$
begin
    insert into public.property_shares (property_id, user_id, platform)
    values (pid, auth.uid(), p_platform);
end;
$$;

-- Function to get 30-day share count
create or replace function public.get_property_share_count(pid text)
returns integer
language sql
stable
security definer
as $$
    select count(*)::integer
    from public.property_shares
    where property_id = pid
    and created_at > now() - interval '30 days';
$$;
