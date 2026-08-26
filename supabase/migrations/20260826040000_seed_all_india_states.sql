-- Seeds the remaining Indian states and union territories (Karnataka and
-- Kerala already exist from the initial schema). This is just reference
-- data — a fixed, well-known list — no library or external data source
-- needed. Cities are no longer pre-seeded per state: the admin form now
-- creates them on demand via find_or_create_city.
--
-- ON CONFLICT DO NOTHING makes this safe to re-run against an environment
-- where some of these already exist.

insert into public.states (name, slug, country_id)
select v.name, v.slug, c.id
from public.countries c
cross join (values
  ('Andhra Pradesh', 'andhra-pradesh'),
  ('Arunachal Pradesh', 'arunachal-pradesh'),
  ('Assam', 'assam'),
  ('Bihar', 'bihar'),
  ('Chhattisgarh', 'chhattisgarh'),
  ('Goa', 'goa'),
  ('Gujarat', 'gujarat'),
  ('Haryana', 'haryana'),
  ('Himachal Pradesh', 'himachal-pradesh'),
  ('Jharkhand', 'jharkhand'),
  ('Madhya Pradesh', 'madhya-pradesh'),
  ('Maharashtra', 'maharashtra'),
  ('Manipur', 'manipur'),
  ('Meghalaya', 'meghalaya'),
  ('Mizoram', 'mizoram'),
  ('Nagaland', 'nagaland'),
  ('Odisha', 'odisha'),
  ('Punjab', 'punjab'),
  ('Rajasthan', 'rajasthan'),
  ('Sikkim', 'sikkim'),
  ('Tamil Nadu', 'tamil-nadu'),
  ('Telangana', 'telangana'),
  ('Tripura', 'tripura'),
  ('Uttar Pradesh', 'uttar-pradesh'),
  ('Uttarakhand', 'uttarakhand'),
  ('West Bengal', 'west-bengal'),
  -- Union territories
  ('Andaman and Nicobar Islands', 'andaman-and-nicobar-islands'),
  ('Chandigarh', 'chandigarh'),
  ('Dadra and Nagar Haveli and Daman and Diu', 'dadra-and-nagar-haveli-and-daman-and-diu'),
  ('Delhi', 'delhi'),
  ('Jammu and Kashmir', 'jammu-and-kashmir'),
  ('Ladakh', 'ladakh'),
  ('Lakshadweep', 'lakshadweep'),
  ('Puducherry', 'puducherry')
) as v(name, slug)
where c.slug = 'india'
on conflict (country_id, slug) do nothing;
