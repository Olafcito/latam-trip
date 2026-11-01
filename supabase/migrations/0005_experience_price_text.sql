-- The experience price is free text in the data, for example "Two-tank from US$155 incl. gear". price_dkk stays numeric.
alter table public.experiences alter column price type text using price::text;
