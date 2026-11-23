ALTER TABLE test_payment_cards ADD COLUMN is_default boolean NOT NULL DEFAULT false;
ALTER TABLE test_payment_cards ADD COLUMN funding_type text NOT NULL DEFAULT 'CREDIT' CHECK(funding_type IN ('CREDIT','DEBIT'));
WITH first_cards AS (
 SELECT DISTINCT ON (company_id,user_id) id,company_id,user_id
 FROM test_payment_cards WHERE active ORDER BY company_id,user_id,created_at,id
)
UPDATE test_payment_cards card SET is_default=true
FROM first_cards first_card
WHERE card.company_id=first_card.company_id AND card.id=first_card.id;
CREATE UNIQUE INDEX one_default_card_per_customer
 ON test_payment_cards(company_id,user_id) WHERE active AND is_default;
