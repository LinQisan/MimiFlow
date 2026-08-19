UPDATE questions
SET content = COALESCE(content, '{}'::jsonb) || '{"shuffleOptions": false}'::jsonb
WHERE id IN (
  '47ebb9c6-221a-44bc-ac28-36487bc24c37',
  '00e42637-083d-4a9d-adc3-e55e3404f5c6',
  '336c8b7d-31f7-4f08-b9d5-07705d5484da'
);
