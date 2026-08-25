-- Seed initial cities for Karnataka and Kerala — curated to places PhotoBlinks
-- would realistically have photoshoot locations (metro hubs where
-- studios/photographers are based, hill stations, beaches, backwaters,
-- heritage/temple towns), not an exhaustive city list.
--
-- Idempotent: joins states by slug (no hardcoded UUIDs) and skips rows that
-- already satisfy the (state_id, slug) unique constraint, so re-running this
-- file is safe and never creates duplicates.

insert into public.cities (state_id, name, slug, is_active)
select s.id, c.name, c.slug, true
from public.states s
join (
  values
    ('karnataka', 'Bengaluru', 'bengaluru'),
    ('karnataka', 'Mysuru', 'mysuru'),
    ('karnataka', 'Coorg', 'coorg'),
    ('karnataka', 'Chikmagalur', 'chikmagalur'),
    ('karnataka', 'Hampi', 'hampi'),
    ('karnataka', 'Gokarna', 'gokarna'),
    ('karnataka', 'Udupi', 'udupi'),
    ('karnataka', 'Mangaluru', 'mangaluru'),
    ('kerala', 'Kochi', 'kochi'),
    ('kerala', 'Munnar', 'munnar'),
    ('kerala', 'Alleppey', 'alleppey'),
    ('kerala', 'Wayanad', 'wayanad'),
    ('kerala', 'Kovalam', 'kovalam'),
    ('kerala', 'Thiruvananthapuram', 'thiruvananthapuram'),
    ('kerala', 'Kumarakom', 'kumarakom'),
    ('kerala', 'Varkala', 'varkala')
) as c(state_slug, name, slug) on c.state_slug = s.slug
where s.country = 'India'
on conflict (state_id, slug) do nothing;
