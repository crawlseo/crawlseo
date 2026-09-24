-- Repair Site.domain values stored by the old add-site modal, which did
-- property.split(":")[1] before parsing URL-prefix properties, so
-- "https://www.example.com/" was saved as "//www.example.com/".
--
-- The fixed value is the bare hostname: leading slashes and everything from
-- the first remaining "/" (the trailing slash, or a path) are removed.
--
-- A user may already have a clean row for the same hostname, and two broken
-- rows can repair to the same hostname. Updating those would violate
-- "Site_userId_domain_key", so they are left untouched and reported with
-- RAISE WARNING (written to the Postgres server log) instead of failing the
-- migration. Such a row is a duplicate site the user can delete in the UI.
DO $$
DECLARE
  r RECORD;
  repaired TEXT;
  clash TEXT;
BEGIN
  FOR r IN
    SELECT "id", "userId", "domain"
    FROM "Site"
    WHERE "domain" LIKE '/%' OR "domain" LIKE '%/'
    ORDER BY "createdAt", "id"
  LOOP
    repaired := lower(split_part(regexp_replace(r."domain", '^/+', ''), '/', 1));

    IF repaired = '' OR repaired = r."domain" THEN
      CONTINUE;
    END IF;

    SELECT "id" INTO clash
    FROM "Site"
    WHERE "userId" = r."userId" AND "domain" = repaired;

    IF clash IS NOT NULL THEN
      RAISE WARNING 'repair_site_domain: Site % (user %) keeps domain "%": site % already uses "%"',
        r."id", r."userId", r."domain", clash, repaired;
    ELSE
      UPDATE "Site" SET "domain" = repaired WHERE "id" = r."id";
    END IF;
  END LOOP;
END $$;
