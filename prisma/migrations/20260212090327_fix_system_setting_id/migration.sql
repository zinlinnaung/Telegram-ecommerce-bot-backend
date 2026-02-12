-- AlterTable
CREATE SEQUENCE systemsetting_id_seq;
ALTER TABLE "SystemSetting" ALTER COLUMN "id" SET DEFAULT nextval('systemsetting_id_seq');
ALTER SEQUENCE systemsetting_id_seq OWNED BY "SystemSetting"."id";
