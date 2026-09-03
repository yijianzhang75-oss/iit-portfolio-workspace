UPDATE projects
SET is_public_editable = 1
WHERE is_public_editable <> 1;
