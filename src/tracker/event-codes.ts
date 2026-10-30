// Codes d'événement numériques envoyés par les traceurs (firmware v10+),
// identiques sur les canaux MQTT, HTTP et SMS — à tenir synchronisés avec
// l'enum Prisma TypeAlarme. Ce module est la source unique : ne plus
// dupliquer ce dictionnaire dans chaque canal.
export const EVENT_CODE_MAP: Record<string, string> = {
  '1': 'DECOLLEMENT_TRACEUR',
  '2': 'BATTERIE_FAIBLE',
  '3': 'VITESSE_EXCESSIVE',
  '4': 'SORTIE_ZONE',
  '5': 'NON_MOUVEMENT',
  // Libellés envoyés par le firmware récent (champ evt textuel).
  'CONDUITE': 'CONDUITE_BRUTALE',
  'CONDUITE BRUTALE': 'CONDUITE_BRUTALE',
  'CONDUITE_BRUTALE': 'CONDUITE_BRUTALE',
  'CHOC': 'CHOC',
  'BRUTAL': 'MOUVEMENT_BRUTAL',
  'MOUVEMENT BRUTAL': 'MOUVEMENT_BRUTAL',
  'MOUVEMENT_BRUTAL': 'MOUVEMENT_BRUTAL',
};

export const mapTrackerEvent = (evt: unknown): string | undefined => {
  if (evt === undefined || evt === null || evt === '') return undefined;
  const key = String(evt).trim().toUpperCase();
  const mapped = EVENT_CODE_MAP[key];
  if (!mapped) {
    console.warn(`[EVENT] Libellé d'événement inconnu ignoré : ${evt}`);
  }
  return mapped;
};
