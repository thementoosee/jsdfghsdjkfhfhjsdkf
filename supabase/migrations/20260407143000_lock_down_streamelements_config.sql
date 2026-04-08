DROP POLICY IF EXISTS "Allow public read access to streamelements_config" ON streamelements_config;
DROP POLICY IF EXISTS "Allow public insert to streamelements_config" ON streamelements_config;
DROP POLICY IF EXISTS "Allow public update to streamelements_config" ON streamelements_config;
DROP POLICY IF EXISTS "Allow public delete from streamelements_config" ON streamelements_config;

REVOKE ALL ON TABLE streamelements_config FROM anon;
REVOKE ALL ON TABLE streamelements_config FROM authenticated;