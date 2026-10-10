-- Shares of a shared transaction must sum to its amount; a private transaction has no shares.
-- A CHECK cannot see other rows, so a constraint trigger does it. DEFERRABLE INITIALLY
-- DEFERRED runs it at COMMIT: inside a transaction the amount and the split rows can change
-- in any order, and only the final state is checked.
CREATE FUNCTION check_transaction_split_sum() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
	tx_id uuid;
	tx_amount bigint;
	tx_visibility transaction_visibility;
	share_sum bigint;
	share_count integer;
BEGIN
	IF TG_TABLE_NAME = 'transactions' THEN
		tx_id := NEW.id;
	ELSIF TG_OP = 'DELETE' THEN
		tx_id := OLD.transaction_id;
	ELSE
		tx_id := NEW.transaction_id;
	END IF;

	SELECT amount, visibility INTO tx_amount, tx_visibility FROM transactions WHERE id = tx_id;
	IF NOT FOUND THEN
		RETURN NULL;
	END IF;

	SELECT coalesce(sum(amount), 0), count(*) INTO share_sum, share_count
	FROM transaction_splits WHERE transaction_id = tx_id;

	IF tx_visibility = 'private' AND share_count > 0 THEN
		RAISE EXCEPTION 'Private transaction % must not have splits', tx_id
			USING ERRCODE = 'check_violation', CONSTRAINT = 'transaction_splits_sum_matches';
	END IF;
	IF tx_visibility = 'shared' AND share_sum <> tx_amount THEN
		RAISE EXCEPTION 'Splits of transaction % sum to %, expected %', tx_id, share_sum, tx_amount
			USING ERRCODE = 'check_violation', CONSTRAINT = 'transaction_splits_sum_matches';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER transactions_split_sum_matches
	AFTER INSERT OR UPDATE OF amount, visibility ON transactions
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION check_transaction_split_sum();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER transaction_splits_sum_matches
	AFTER INSERT OR UPDATE OR DELETE ON transaction_splits
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION check_transaction_split_sum();
