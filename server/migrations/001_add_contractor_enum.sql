ALTER TYPE employment_type ADD VALUE IF NOT EXISTS 'CONTRACTOR';

UPDATE employees
SET employment_type = 'CONTRACTOR'
WHERE id = '76a5a4c9-ca56-47fd-a2f1-65c50c705d82'
  AND employment_type != 'CONTRACTOR';
