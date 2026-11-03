CREATE TABLE test_payment_cards (
 id uuid PRIMARY KEY, company_id uuid NOT NULL, user_id uuid NOT NULL,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80), brand text NOT NULL,
 prefix text NOT NULL CHECK(prefix ~ '^[0-9]{6}$'), last_four text NOT NULL CHECK(last_four ~ '^[0-9]{4}$'),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(company_id,id), UNIQUE(company_id,user_id,brand,prefix,last_four),
 FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id)
);
CREATE TABLE test_payment_choices (
 company_id uuid NOT NULL, intent_id uuid NOT NULL, user_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN ('CARD','TRANSFER')), card_id uuid,
 card_label text, card_brand text, card_last_four text,
 PRIMARY KEY(company_id,intent_id),
 FOREIGN KEY(company_id,intent_id) REFERENCES payment_intents(company_id,id),
 FOREIGN KEY(company_id,user_id) REFERENCES users(company_id,id),
 FOREIGN KEY(company_id,card_id) REFERENCES test_payment_cards(company_id,id),
 CHECK((method='TRANSFER' AND card_id IS NULL AND card_last_four IS NULL) OR (method='CARD' AND card_id IS NOT NULL AND card_label IS NOT NULL AND card_brand IS NOT NULL AND card_last_four ~ '^[0-9]{4}$'))
);
CREATE TRIGGER test_choice_immutable BEFORE UPDATE OR DELETE ON test_payment_choices FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
