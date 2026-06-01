CREATE UNIQUE INDEX "invitations_org_email_pending_uniq" ON "invitations" ("organization_id","email") WHERE "status" = 'pending';
