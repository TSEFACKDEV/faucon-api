-- CreateIndex
CREATE INDEX "commandes_descendantes_vehiculeId_idx" ON "commandes_descendantes"("vehiculeId");

-- CreateIndex
CREATE INDEX "commandes_descendantes_statutExecution_dateEnvoi_idx" ON "commandes_descendantes"("statutExecution", "dateEnvoi");
