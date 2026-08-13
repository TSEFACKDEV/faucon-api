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
};

export const mapTrackerEvent = (evt: unknown): string | undefined => {
  if (evt === undefined || evt === null || evt === '') return undefined;
  return EVENT_CODE_MAP[String(evt)];
};
