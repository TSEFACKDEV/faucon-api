// Liste d'origines autorisées, partagée entre Express (CORS HTTP) et
// Socket.IO (WebSocket), pour éviter deux configurations divergentes.
// `CORS_ORIGIN` accepte une liste séparée par des virgules.
export const corsOrigins: string[] = (
  process.env.CORS_ORIGIN ?? 'http://localhost:3001'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
