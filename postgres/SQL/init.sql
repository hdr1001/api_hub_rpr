-- *********************************************************************
--
-- SQL DDL statements in support of API Hub data persistence
-- SQL code file: init.sql
--
-- Copyright 2019 Hans de Rooij
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--       http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, 
-- software distributed under the License is distributed on an 
-- "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, 
-- either express or implied. See the License for the specific 
-- language governing permissions and limitations under the 
-- License.
--
-- *********************************************************************

-- DROP TRIGGER trgr_archive_cmpelk ON public.products_dnb;
-- DROP FUNCTION public.f_archive_cmpelk();
-- DROP TRIGGER trgr_archive_cmptcs ON public.products_dnb;
-- DROP FUNCTION public.f_archive_cmptcs();
-- ALTER TABLE public.auth_tokens DROP CONSTRAINT auth_tokens_pkey;
-- ALTER TABLE public.products_dnb DROP CONSTRAINT products_dnb_pkey;
-- ALTER TABLE public.archive_cmpelk DROP CONSTRAINT archive_cmpelk_pkey;
-- ALTER TABLE public.archive_cmptcs DROP CONSTRAINT archive_cmptcs_pkey;
-- DROP INDEX public.auth_tokens_api_id_desc_idx;
-- DROP TABLE public.auth_tokens;
-- DROP TABLE public.products_dnb;
-- DROP TABLE public.archive_cmpelk;
-- DROP TABLE public.archive_cmptcs;
-- DROP TABLE public.id_res;
-- DROP SEQUENCE public.auth_tokens_id_seq;
-- DROP SEQUENCE public.archive_cmpelk_id_seq;
-- DROP SEQUENCE public.archive_cmptcs_id_seq;
-- DROP SEQUENCE public.id_res_id_seq;

-- Create the sequence for the primary key of table auth_tokens
CREATE SEQUENCE public.auth_tokens_id_seq
    INCREMENT 1
    START 1
    MINVALUE 1
    MAXVALUE 9223372036854775807
    CACHE 1;

-- Create the sequence for the primary key of table archive_cmpelk
CREATE SEQUENCE public.archive_cmpelk_id_seq
    INCREMENT 1
    START 1
    MINVALUE 1
    MAXVALUE 9223372036854775807
    CACHE 1;

-- Create the sequence for the primary key of table archive_cmptcs
CREATE SEQUENCE public.archive_cmptcs_id_seq
    INCREMENT 1
    START 1
    MINVALUE 1
    MAXVALUE 9223372036854775807
    CACHE 1;

-- Create the sequence for the primary key of table id_res
--CREATE SEQUENCE public.id_res_id_seq
--    INCREMENT 1
--    START 1
--    MINVALUE 1
--    MAXVALUE 9223372036854775807
--    CACHE 1;

-- Create table auth_tokens for storing Direct 2.0 Onboard tokens
CREATE TABLE public.auth_tokens
(
    id integer NOT NULL DEFAULT nextval('auth_tokens_id_seq'::regclass),
    api char(3),
    token character varying(128) COLLATE pg_catalog."default",
    expires_in bigint,
    obtained_at bigint,
    CONSTRAINT auth_tokens_pkey PRIMARY KEY (id)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

-- Create table for storing D&B data products
CREATE TABLE public.products_dnb (
    duns character varying(11) COLLATE pg_catalog."default",
    cmpelk JSONB,
    cmpelk_obtained_at bigint,
    cmptcs JSONB,
    cmptcs_obtained_at bigint,
    gdp_em XML,
    gdp_em_obtained_at bigint,
    CMP_VRF_ID JSONB,
    CMP_VRF_ID_obtained_at bigint,
    CMP_BOS JSONB,
    CMP_BOS_obtained_at bigint,
    CONSTRAINT products_dnb_pkey PRIMARY KEY (duns)
)
WITH (
    OIDS = false
)
TABLESPACE pg_default;

-- Create table for archiving a cmpelk Direct+ data product
CREATE TABLE public.archive_cmpelk (
    id integer NOT NULL DEFAULT nextval('archive_cmpelk_id_seq'::regclass),
    duns character varying(11) COLLATE pg_catalog."default",
    product JSONB,
    obtained_at bigint,
    archived_at bigint,
    CONSTRAINT archive_cmpelk_pkey PRIMARY KEY (id)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

-- Create table for archiving a cmptcs Direct+ data product
CREATE TABLE public.archive_cmptcs (
    id integer NOT NULL DEFAULT nextval('archive_cmptcs_id_seq'::regclass),
    duns character varying(11) COLLATE pg_catalog."default",
    product JSONB,
    obtained_at bigint,
    archived_at bigint,
    CONSTRAINT archive_cmptcs_pkey PRIMARY KEY (id)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

-- Create table storing Direct+ identity resolution in & output
--CREATE TABLE public.id_res
--(
--    id integer NOT NULL DEFAULT nextval('id_res_id_seq'::regclass),
--    parameters JSONB,
--    result JSONB,
--    http_stat char(3),
--    obtained_at bigint,
--    duns character varying(11) COLLATE pg_catalog."default",
--    CONSTRAINT id_res_pkey PRIMARY KEY (id)
--)
--WITH (
--    OIDS = FALSE
--)
--TABLESPACE pg_default;

-- Create an index for reverse sorting on id in table auth_tokens
CREATE UNIQUE INDEX auth_tokens_api_id_desc_idx
    ON public.auth_tokens USING btree
    (api, id DESC NULLS LAST)
    TABLESPACE pg_default;

-- Create a function to archive a Direct+ cmpelk product
CREATE FUNCTION public.f_archive_cmpelk()
    RETURNS trigger
    LANGUAGE 'plpgsql'
AS $BODY$
BEGIN
    INSERT INTO archive_cmpelk(duns, product, obtained_at, archived_at)
    VALUES (OLD.duns, OLD.cmpelk, OLD.cmpelk_obtained_at, NEW.cmpelk_obtained_at);
    RETURN NEW;
END;
$BODY$;

-- Create a database trigger to archive a cmpelk product on update
CREATE TRIGGER trgr_archive_cmpelk
    AFTER UPDATE OF cmpelk
    ON public.products_dnb
    FOR EACH ROW
    EXECUTE PROCEDURE public.f_archive_cmpelk();

-- Create a function to archive a Direct+ cmptcs product
CREATE FUNCTION public.f_archive_cmptcs()
    RETURNS trigger
    LANGUAGE 'plpgsql'
AS $BODY$
BEGIN
    INSERT INTO archive_cmptcs(duns, product, obtained_at, archived_at)
    VALUES (OLD.duns, OLD.cmptcs, OLD.cmptcs_obtained_at, NEW.cmptcs_obtained_at);
    RETURN NEW;
END;
$BODY$;

-- Create a database trigger to archive a cmptcs product on update
CREATE TRIGGER trgr_archive_cmptcs
    AFTER UPDATE OF cmptcs
    ON public.products_dnb
    FOR EACH ROW
    EXECUTE PROCEDURE public.f_archive_cmptcs();

-- Insert a couple of default records
INSERT INTO auth_tokens (api, token, expires_in, obtained_at) VALUES('dpl', '', 0, 946681200000);
INSERT INTO auth_tokens (api, token, expires_in, obtained_at) VALUES('d2o', '', 0, 946681200000);

