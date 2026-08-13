// Extrait un paramètre d'URL string (Express peut fournir string | string[])
// — source unique, utilisé par les deux contrôleurs.
export const getParamId = (param: string | string[] | undefined): string | null => {
  if (!param) return null;
  if (Array.isArray(param)) return param[0] || null;
  return param;
};
