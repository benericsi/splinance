-- The data track's login to the demo database. Local only: the password is as public as the
-- compose credentials; on a server it is random and the same SQL runs once by hand.
-- Its rights come from splinance_analytics_reader, which the analytics migration grants SELECT
-- on the views to. Created here too, because this script runs before any migration.
DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'splinance_analytics_reader') THEN
		CREATE ROLE splinance_analytics_reader NOLOGIN;
	END IF;
END;
$$;

CREATE ROLE splinance_demo_analytics LOGIN PASSWORD 'splinance_demo_analytics'
	IN ROLE splinance_analytics_reader CONNECTION LIMIT 3;
ALTER ROLE splinance_demo_analytics SET default_transaction_read_only = on;
ALTER ROLE splinance_demo_analytics SET statement_timeout = '5min';

-- Every role may connect to every database by default; only the demo one is meant for it.
REVOKE CONNECT ON DATABASE splinance, splinance_test, splinance_demo FROM PUBLIC;
GRANT CONNECT ON DATABASE splinance_demo TO splinance_demo_analytics;
