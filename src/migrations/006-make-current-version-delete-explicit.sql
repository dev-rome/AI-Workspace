ALTER TABLE assistants
DROP CONSTRAINT assistants_current_version_id_fkey;

ALTER TABLE assistants
ADD CONSTRAINT assistants_current_version_id_fkey
FOREIGN KEY (current_version_id)
REFERENCES assistant_versions(id)
ON DELETE NO ACTION;