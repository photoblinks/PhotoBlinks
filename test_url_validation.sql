-- Test URL validation logic (matches isValidHttpUrl in page.tsx)
SELECT 
  url,
  CASE 
    WHEN url ~ '^https?://' THEN 'VALID'
    ELSE 'INVALID'
  END as validation
FROM (
  SELECT unnest(source_urls) as url
  FROM ai_field_verification_details
  WHERE array_length(source_urls, 1) > 0
) u
GROUP BY url;