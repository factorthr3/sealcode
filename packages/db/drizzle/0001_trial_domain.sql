ALTER TABLE "orgs" ADD COLUMN "trial_domain" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_trial_domain_uniq" ON "orgs" USING btree ("trial_domain") WHERE trial_domain is not null;